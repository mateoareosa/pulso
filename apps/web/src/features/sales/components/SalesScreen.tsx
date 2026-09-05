import React, { useState, useRef, useEffect } from 'react';
import { useSalesStore } from '../store/sales.store';
import { LiveReceipt, MoneyKeypad } from '@pulso/ui';
import { Money } from '@pulso/domain';
import { IconSearch, IconBarcode, IconCheck, IconAlert } from '@pulso/icons';
import { QUICK_PRODUCTS, searchProducts } from '../services/product-search';

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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredProducts = searchProducts(QUICK_PRODUCTS, searchQuery);

  const totalCents = items.reduce((acc, it) => acc + it.totalPriceCents, 0);
  const totalFormatted = Money.fromCents(totalCents).format();

  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    setSelectedIndex(0);
    if (errorMessage) {
      dismissError();
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredProducts.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % filteredProducts.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredProducts.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + filteredProducts.length) % filteredProducts.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProducts.length === 0) {
        setErrorMessage(`Producto no encontrado para "${searchQuery}"`);
        return;
      }

      const selectedProduct = filteredProducts[selectedIndex] || filteredProducts[0];
      if (selectedProduct) {
        addItem(selectedProduct);
        setSearchQuery('');
        setSelectedIndex(0);
        dismissError();
      }
    }
  };

  // Global Keyboard Navigation Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // While cash tender modal is open, MoneyKeypad has exclusive keyboard ownership
      if (isTenderOpen) {
        return;
      }

      // Hotkey F2: Focus scanner/search
      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // Hotkey F4: Open Cash Tender
      if (e.key === 'F4') {
        e.preventDefault();
        if (items.length > 0 && !lastSaleSuccess) {
          openTender();
        }
        return;
      }

      // Hotkey Escape or Enter when lastSaleSuccess is active
      if (lastSaleSuccess) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          dismissSuccess();
          searchInputRef.current?.focus();
          return;
        }
      }

      // Numeric shortcuts 1-8 for quick product addition only when input is not active and search is empty
      const isInputActive = document.activeElement?.tagName === 'INPUT';
      if (!isInputActive && !lastSaleSuccess && searchQuery.trim() === '') {
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
    searchQuery,
    openTender,
    dismissSuccess,
    addItem,
  ]);

  // Handle Search / Barcode Form Submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredProducts.length === 0) {
      if (searchQuery.trim()) {
        setErrorMessage(`Producto no encontrado para "${searchQuery}"`);
      }
      return;
    }

    const selectedProduct = filteredProducts[selectedIndex] || filteredProducts[0];
    if (selectedProduct) {
      addItem(selectedProduct);
      setSearchQuery('');
      setSelectedIndex(0);
      dismissError();
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
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleInputKeyDown}
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

        {/* Quick Products Ribbon or Search Results */}
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
              {searchQuery.trim()
                ? 'RESULTADOS DE BÚSQUEDA'
                : 'CINTA RÁPIDA DE MOSTRADOR (PRODUCTOS FAVORITOS)'}
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              {searchQuery.trim()
                ? `${filteredProducts.length} producto${filteredProducts.length === 1 ? '' : 's'} — flechas ↑↓ y Enter`
                : 'Atajos rápidos: números 1 al 8'}
            </span>
          </div>

          {filteredProducts.length === 0 ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                backgroundColor: 'var(--color-surface-sunken)',
                border: '2px dashed var(--color-border)',
                color: 'var(--color-ink-muted)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
              }}
            >
              Producto no encontrado para "{searchQuery}"
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                gap: '10px',
              }}
            >
              {filteredProducts.map((prod, idx) => {
                const isSelected = idx === selectedIndex;
                const isSearching = searchQuery.trim() !== '';

                return (
                  <button
                    key={prod.productId}
                    type="button"
                    onClick={() => {
                      addItem(prod);
                      setSearchQuery('');
                      setSelectedIndex(0);
                      dismissError();
                      searchInputRef.current?.focus();
                    }}
                    style={{
                      backgroundColor:
                        isSelected && isSearching
                          ? 'var(--color-pulse-soft)'
                          : 'var(--color-surface)',
                      border:
                        isSelected && isSearching
                          ? '2px solid var(--color-pulse-solid)'
                          : '2px solid var(--color-border)',
                      padding: '10px 12px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      boxShadow:
                        isSelected && isSearching
                          ? '0 0 0 2px var(--color-pulse-focus)'
                          : 'var(--shadow-key)',
                      transition:
                        'transform var(--duration-fast) ease, border-color var(--duration-fast) ease',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      minHeight: '84px',
                      position: 'relative',
                    }}
                  >
                    {/* Header: Category tag + shortcut badge (only in quick ribbon) */}
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
                      {!isSearching && (
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
                      )}
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
                );
              })}
            </div>
          )}
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
            onCancel={() => {
              closeTender();
              searchInputRef.current?.focus();
            }}
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
              onClick={() => {
                dismissSuccess();
                searchInputRef.current?.focus();
              }}
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
