import React, { useState, useRef, useEffect } from 'react';
import { useSalesStore } from '../store/sales.store';
import { OperationalRibbon, LiveReceipt, MoneyKeypad } from '@pulso/ui';
import { Money } from '@pulso/domain';
import { IconSearch, IconBarcode, IconCheck, IconAlert } from '@pulso/icons';

const QUICK_PRODUCTS = [
  {
    productId: 'prod-01',
    name: 'Alfajor Triple Dulce de Leche',
    barcode: '779001',
    unitPriceCents: 120000,
  },
  { productId: 'prod-02', name: 'Gaseosa Cola 500ml', barcode: '779002', unitPriceCents: 150000 },
  { productId: 'prod-03', name: 'Agua Mineral 500ml', barcode: '779003', unitPriceCents: 100000 },
  { productId: 'prod-04', name: 'Turrón de Maní', barcode: '779004', unitPriceCents: 45000 },
  { productId: 'prod-05', name: 'Chicles Menta Fuerte', barcode: '779005', unitPriceCents: 60000 },
  { productId: 'prod-06', name: 'Caramelos Ácidos x10', barcode: '779006', unitPriceCents: 80000 },
  {
    productId: 'prod-07',
    name: 'Galletitas Rellenas Vainilla',
    barcode: '779007',
    unitPriceCents: 180000,
  },
  {
    productId: 'prod-08',
    name: 'Barra de Cereal Frutilla',
    barcode: '779008',
    unitPriceCents: 90000,
  },
];

export const SalesScreen: React.FC = () => {
  const {
    items,
    connectionStatus,
    pendingSyncCount,
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
    toggleConnection,
    processCashPayment,
    syncPendingSales,
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
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (items.length > 0 && !isTenderOpen) {
          openTender();
        }
      } else if (e.key === 'Escape') {
        if (isTenderOpen) {
          e.preventDefault();
          closeTender();
        } else if (lastSaleSuccess) {
          e.preventDefault();
          dismissSuccess();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items.length, isTenderOpen, lastSaleSuccess, openTender, closeTender, dismissSuccess]);

  // Handle Search / Barcode Form Submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Search by exact barcode or partial name
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      {/* Persistent Operational Ribbon */}
      <OperationalRibbon
        connectionStatus={connectionStatus}
        pendingSyncCount={pendingSyncCount}
        shiftLabel="Turno Tarde #14"
        operatorName="Mateo (Cajero)"
        expectedCashFormatted="$ 45.200,00"
        onToggleConnection={toggleConnection}
        onSyncClick={syncPendingSales}
      />

      {/* Main Operational Counter */}
      <main
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(400px, 1.4fr) minmax(380px, 1fr)',
          flex: 1,
          gap: '16px',
          padding: '16px',
          overflow: 'hidden',
        }}
      >
        {/* Left Column: Fast Search, Quick Strip, Shortcuts & Actions */}
        <section
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            overflowY: 'auto',
          }}
        >
          {/* Scanner & Search Input */}
          <form onSubmit={handleSearchSubmit} style={{ position: 'relative' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--color-ticket)',
                border: '2px solid var(--color-ink)',
                boxShadow: 'var(--shadow-key)',
                padding: '4px 12px',
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
                  padding: '10px 0',
                  border: 'none',
                  outline: 'none',
                  backgroundColor: 'transparent',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '1rem',
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
                  padding: '8px 14px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
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
                backgroundColor: 'var(--color-tomato-subtle)',
                border: '2px solid var(--color-tomato)',
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
                  color: 'var(--color-tomato)',
                }}
              >
                <IconAlert size={18} />
                <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{errorMessage}</span>
              </div>
              <button
                onClick={dismissError}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-tomato)',
                  fontWeight: 900,
                  cursor: 'pointer',
                  fontSize: '1rem',
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
                marginBottom: '8px',
              }}
            >
              <span style={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.5px' }}>
                CINTA RÁPIDA DE MOSTRADOR
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-ink-muted)' }}>
                Click directo o números rápidos
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '8px',
              }}
            >
              {QUICK_PRODUCTS.map((prod) => (
                <button
                  key={prod.productId}
                  type="button"
                  onClick={() => addItem(prod)}
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '2px solid var(--color-ink)',
                    padding: '10px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-key)',
                    transition: 'transform 100ms ease',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '74px',
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      lineHeight: 1.2,
                      color: 'var(--color-ink)',
                    }}
                  >
                    {prod.name}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 900,
                      fontSize: '0.95rem',
                      color: 'var(--color-ink)',
                      marginTop: '6px',
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
              padding: '12px',
              fontSize: '0.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontWeight: 700 }}>Atajos rápidos de teclado: </span>
              <span>
                <kbd>F2</kbd> Escanear | <kbd>F4</kbd> Cobrar efectivo | <kbd>ESC</kbd> Cancelar
              </span>
            </div>
            {items.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--color-tomato)',
                  color: 'var(--color-tomato)',
                  padding: '4px 8px',
                  fontWeight: 700,
                  fontSize: '0.75rem',
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
                items.length > 0 ? 'var(--color-pulse)' : 'var(--color-surface-sunken)',
              color: items.length > 0 ? 'var(--color-ink)' : 'var(--color-ink-subtle)',
              border: '3px solid var(--color-ink)',
              boxShadow: items.length > 0 ? 'var(--shadow-key)' : 'none',
              fontWeight: 900,
              fontSize: '1.2rem',
              letterSpacing: '1px',
              cursor: items.length > 0 ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
            }}
          >
            <span>COBRAR EN EFECTIVO (F4)</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{totalFormatted}</span>
          </button>
        </section>
      </main>

      {/* Modal: MoneyKeypad Cash Tender Dialog */}
      {isTenderOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: 'var(--shadow-receipt)',
              fontFamily: 'var(--font-mono)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-pulse)',
                color: 'var(--color-ink)',
                marginBottom: '12px',
              }}
            >
              <IconCheck size={28} />
            </div>

            <h2 style={{ margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 900 }}>
              {lastSaleSuccess.isOffline ? 'VENTA GUARDADA LOCAL' : 'VENTA CONFIRMADA'}
            </h2>
            <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--color-ink-muted)' }}>
              Identificador: {lastSaleSuccess.saleId}
            </p>

            <div
              style={{
                backgroundColor: 'var(--color-ticket-edge)',
                border: '1px dashed var(--color-ink)',
                padding: '12px',
                marginBottom: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                textAlign: 'left',
                fontSize: '0.9rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Total:</span>
                <span style={{ fontWeight: 800 }}>{lastSaleSuccess.totalFormatted}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Efectivo recibido:</span>
                <span>{lastSaleSuccess.paidFormatted}</span>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--color-border)',
                  paddingTop: '6px',
                  fontWeight: 900,
                  fontSize: '1.1rem',
                  color: 'var(--color-ink)',
                }}
              >
                <span>VUELTO:</span>
                <span>{lastSaleSuccess.changeFormatted}</span>
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
                fontSize: '1rem',
                cursor: 'pointer',
              }}
            >
              NUEVA VENTA (ENTER / ESC)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
