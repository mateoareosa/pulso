import React, { useState, useRef, useEffect } from 'react';
import { useSalesStore } from '../store/sales.store';
import { LiveReceipt, MoneyKeypad } from '@pulso/ui';
import { Money } from '@pulso/domain';
import { IconSearch, IconBarcode, IconCheck, IconAlert } from '@pulso/icons';

interface QuickProduct {
  productId: string;
  name: string;
  category: string;
  barcode: string;
  unitPriceCents: number;
  shortcutNumber: number;
}

const QUICK_PRODUCTS: QuickProduct[] = [
  {
    productId: 'prod-01',
    name: 'Alfajor Triple Dulce de Leche',
    category: 'GOLOSINAS',
    barcode: '779001',
    unitPriceCents: 120000,
    shortcutNumber: 1,
  },
  {
    productId: 'prod-02',
    name: 'Gaseosa Cola 500ml',
    category: 'BEBIDAS',
    barcode: '779002',
    unitPriceCents: 150000,
    shortcutNumber: 2,
  },
  {
    productId: 'prod-03',
    name: 'Agua Mineral 500ml',
    category: 'BEBIDAS',
    barcode: '779003',
    unitPriceCents: 100000,
    shortcutNumber: 3,
  },
  {
    productId: 'prod-04',
    name: 'Turrón de Maní',
    category: 'GOLOSINAS',
    barcode: '779004',
    unitPriceCents: 45000,
    shortcutNumber: 4,
  },
  {
    productId: 'prod-05',
    name: 'Chicles Menta Fuerte',
    category: 'GOLOSINAS',
    barcode: '779005',
    unitPriceCents: 60000,
    shortcutNumber: 5,
  },
  {
    productId: 'prod-06',
    name: 'Caramelos Ácidos x10',
    category: 'GOLOSINAS',
    barcode: '779006',
    unitPriceCents: 80000,
    shortcutNumber: 6,
  },
  {
    productId: 'prod-07',
    name: 'Galletitas Rellenas Vainilla',
    category: 'SNACKS',
    barcode: '779007',
    unitPriceCents: 180000,
    shortcutNumber: 7,
  },
  {
    productId: 'prod-08',
    name: 'Barra de Cereal Frutilla',
    category: 'SNACKS',
    barcode: '779008',
    unitPriceCents: 90000,
    shortcutNumber: 8,
  },
];

export const SalesScreen: React.FC = () => {
  const {
    items,
    isTenderOpen,
    lastSaleSuccess,
    errorMessage,
    selectedItemId,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    setSelectedItemId,
    openTender,
    closeTender,
    processCashPayment,
    dismissSuccess,
    dismissError,
    setErrorMessage,
  } = useSalesStore();

  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const totalCents = items.reduce((acc, it) => acc + it.totalPriceCents, 0);
  const totalFormatted = Money.fromCents(totalCents).format();

  // Global Keyboard Navigation Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Hotkey F2: Focus scanner/search
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Hotkey F4: Open Cash Tender
      if (e.key === 'F4') {
        e.preventDefault();
        if (items.length > 0 && !isTenderOpen) {
          openTender();
        }
        return;
      }

      // Hotkey Escape: Cancel tender or dismiss success
      if (e.key === 'Escape') {
        if (isTenderOpen) {
          e.preventDefault();
          closeTender();
        } else if (lastSaleSuccess) {
          e.preventDefault();
          dismissSuccess();
        }
        return;
      }

      // Numeric shortcuts 1-8 for quick product addition when input is not active
      const isInputActive = document.activeElement?.tagName === 'INPUT';
      if (!isInputActive && !isTenderOpen && !lastSaleSuccess) {
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= 8) {
          const quick = QUICK_PRODUCTS.find((p) => p.shortcutNumber === num);
          if (quick) {
            e.preventDefault();
            addItem(quick);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    items.length,
    isTenderOpen,
    lastSaleSuccess,
    openTender,
    closeTender,
    dismissSuccess,
    addItem,
  ]);

  // Handle Search / Barcode Form Submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const found = QUICK_PRODUCTS.find(
      (p) =>
        p.barcode === searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
    );

    if (found) {
      addItem(found);
      setSearchQuery('');
    } else {
      setErrorMessage(`Producto no encontrado para "${searchQuery}"`);
    }
  };

  const receiptItems = items.map((it) => ({
    id: it.id,
    productId: it.productId,
    name: it.name,
    quantity: it.quantity,
    unitPriceFormatted: Money.fromCents(it.unitPriceCents).format(),
    totalPriceFormatted: Money.fromCents(it.totalPriceCents).format(),
    barcode: it.barcode,
  }));

  return (
    <main
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(420px, 1.4fr) minmax(380px, 1fr)',
        flex: 1,
        gap: '16px',
        padding: '16px',
        overflow: 'hidden',
        height: 'calc(100vh - 50px)',
      }}
    >
      {/* Left Column: Fast Search, Quick Strip, Shortcuts & Actions */}
      <section
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          overflowY: 'auto',
        }}
      >
        {/* Scanner & Search Input Bar */}
        <form onSubmit={handleSearchSubmit} style={{ position: 'relative' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'var(--color-ticket)',
              border: '2px solid var(--color-ink)',
              boxShadow: 'var(--shadow-key)',
              padding: '3px 12px',
              minHeight: '46px',
            }}
          >
            <IconBarcode size={24} style={{ color: 'var(--color-ink)', marginRight: '10px' }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Escanear código o buscar producto (Atajo: F2)..."
              aria-label="Escanear o buscar producto"
              style={{
                width: '100%',
                padding: '8px 0',
                border: 'none',
                outline: 'none',
                backgroundColor: 'transparent',
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--text-base)',
                fontWeight: 600,
                color: 'var(--color-ink)',
              }}
            />
            <button
              type="submit"
              style={{
                backgroundColor: 'var(--color-ink)',
                color: 'var(--color-ticket)',
                border: 'none',
                padding: '8px 16px',
                fontWeight: 800,
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                minHeight: '34px',
              }}
            >
              <IconSearch size={16} />
              <span>AGREGAR</span>
            </button>
          </div>
        </form>

        {/* Error Message Banner */}
        {errorMessage && (
          <div
            role="alert"
            style={{
              backgroundColor: 'var(--color-tomato-soft)',
              border: '2px solid var(--color-tomato-solid)',
              padding: '10px 14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: 'var(--color-tomato-solid)',
              }}
            >
              <IconAlert size={18} />
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 'var(--text-sm)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {errorMessage}
              </span>
            </div>
            <button
              type="button"
              onClick={dismissError}
              aria-label="Cerrar advertencia"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-tomato-solid)',
                fontWeight: 900,
                cursor: 'pointer',
                fontSize: 'var(--text-lg)',
                padding: '2px 6px',
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Quick Products Ribbon (Cinta de alta rotación) */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontWeight: 800,
                fontSize: 'var(--text-xs)',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
              }}
            >
              CINTA RÁPIDA DE MOSTRADOR
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Atajos directos: números <kbd>1</kbd> al <kbd>8</kbd>
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              gap: '10px',
            }}
          >
            {QUICK_PRODUCTS.map((prod) => (
              <button
                key={prod.productId}
                type="button"
                onClick={() => addItem(prod)}
                style={{
                  backgroundColor: 'var(--color-surface)',
                  border: '2px solid var(--color-border)',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-key)',
                  transition:
                    'transform var(--duration-fast) ease, border-color var(--duration-fast) ease',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '84px',
                  position: 'relative',
                }}
              >
                {/* Header: Category tag + shortcut badge */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 700,
                      color: 'var(--color-ink-muted)',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {prod.category}
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 800,
                      backgroundColor: 'var(--color-surface-sunken)',
                      border: '1px solid var(--color-ink)',
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-xs)',
                      color: 'var(--color-ink)',
                    }}
                  >
                    [{prod.shortcutNumber}]
                  </span>
                </div>

                {/* Product Name (Humanist Sans) */}
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.25,
                    color: 'var(--color-ink)',
                  }}
                >
                  {prod.name}
                </div>

                {/* Price (IBM Plex Mono bold) */}
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    fontSize: 'var(--text-base)',
                    color: 'var(--color-ink)',
                    marginTop: '8px',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {Money.fromCents(prod.unitPriceCents).format()}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Keyboard Shortcuts Operational Guide */}
        <div
          style={{
            marginTop: 'auto',
            backgroundColor: 'var(--color-surface-sunken)',
            border: '1px solid var(--color-border)',
            padding: '10px 14px',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <div>
            <span style={{ fontWeight: 700 }}>Atajos rápidos: </span>
            <span>
              <kbd>F2</kbd> Escanear | <kbd>F4</kbd> Cobrar efectivo | <kbd>1-8</kbd> Productos |{' '}
              <kbd>ESC</kbd> Cancelar
            </span>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={clearCart}
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--color-tomato-text)',
                color: 'var(--color-tomato-text)',
                padding: '4px 10px',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              Limpiar ticket
            </button>
          )}
        </div>
      </section>

      {/* Right Column: LiveReceipt & Primary Action */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%' }}>
        <div style={{ flex: 1, minHeight: 0 }}>
          <LiveReceipt
            items={receiptItems}
            totalFormatted={totalFormatted}
            selectedItemId={selectedItemId || undefined}
            onSelectItem={setSelectedItemId}
            onQuantityChange={updateQuantity}
            onRemoveItem={removeItem}
          />
        </div>

        {/* Primary Action Button: COBRAR */}
        <button
          type="button"
          disabled={items.length === 0}
          onClick={openTender}
          style={{
            height: '56px',
            backgroundColor:
              items.length > 0 ? 'var(--color-pulse-solid)' : 'var(--color-surface-sunken)',
            color: items.length > 0 ? '#0f172a' : 'var(--color-ink-subtle)',
            border: '2px solid var(--color-ink)',
            boxShadow: items.length > 0 ? 'var(--shadow-key)' : 'none',
            fontWeight: 900,
            fontSize: 'var(--text-lg)',
            letterSpacing: '0.8px',
            cursor: items.length > 0 ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '14px',
            fontFamily: 'var(--font-sans)',
            transition: 'background-color var(--duration-fast) ease',
          }}
        >
          <span>COBRAR EN EFECTIVO (F4)</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              fontSize: 'var(--text-xl)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {totalFormatted}
          </span>
        </button>
      </section>

      {/* Modal: MoneyKeypad Cash Tender Dialog */}
      {isTenderOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '16px',
          }}
        >
          <MoneyKeypad
            totalCents={totalCents}
            onConfirmTender={async ({ receivedCents, changeCents }) => {
              await processCashPayment(receivedCents, changeCents);
            }}
            onCancel={closeTender}
          />
        </div>
      )}

      {/* Modal: Sale Success Confirmation Seal */}
      {lastSaleSuccess && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: '16px',
          }}
        >
          <div
            role="status"
            aria-live="polite"
            style={{
              backgroundColor: 'var(--color-ticket)',
              border: '3px solid var(--color-ink)',
              padding: '28px',
              maxWidth: '440px',
              width: '100%',
              boxShadow: 'var(--shadow-modal)',
              fontFamily: 'var(--font-sans)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-pulse-solid)',
                color: '#0f172a',
                marginBottom: '14px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
              }}
            >
              <IconCheck size={32} />
            </div>

            <h2 style={{ margin: '0 0 6px', fontSize: 'var(--text-xl)', fontWeight: 900 }}>
              {lastSaleSuccess.isOffline ? 'VENTA GUARDADA LOCAL' : 'VENTA CONFIRMADA'}
            </h2>
            <p
              style={{
                margin: '0 0 18px',
                fontSize: 'var(--text-xs)',
                color: 'var(--color-ink-muted)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Identificador: {lastSaleSuccess.saleId}
            </p>

            <div
              style={{
                backgroundColor: 'var(--color-ticket-edge)',
                border: '1px dashed var(--color-ink)',
                padding: '14px 16px',
                marginBottom: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                textAlign: 'left',
                fontSize: 'var(--text-sm)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total venta:</span>
                <span
                  style={{
                    fontWeight: 800,
                    fontFamily: 'var(--font-mono)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {lastSaleSuccess.totalFormatted}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Efectivo recibido:</span>
                <span
                  style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {lastSaleSuccess.paidFormatted}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: '8px',
                  fontWeight: 900,
                  fontSize: 'var(--text-lg)',
                  color: 'var(--color-ink)',
                }}
              >
                <span>VUELTO:</span>
                <span
                  style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
                >
                  {lastSaleSuccess.changeFormatted}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={dismissSuccess}
              style={{
                width: '100%',
                height: '48px',
                backgroundColor: 'var(--color-ink)',
                color: 'var(--color-ticket)',
                border: 'none',
                fontWeight: 900,
                fontSize: 'var(--text-base)',
                cursor: 'pointer',
                letterSpacing: '0.6px',
              }}
            >
              NUEVA VENTA (ENTER / ESC)
            </button>
          </div>
        </div>
      )}
    </main>
  );
};
