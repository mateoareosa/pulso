import React, { useState, useRef, useEffect } from 'react';
import { useSalesStore } from '../store/sales.store';
import { useCatalogStore, CatalogProductItem } from '../../catalog/store/catalog.store';
import { useCashStore } from '../../cash/store/cash.store';
import { useOptionalAuth } from '../../auth/AuthContext';
import { normalizeSearchText } from '../../sync/offline-db';
import { LiveReceipt, MoneyKeypad } from '@pulso/ui';
import { Money } from '@pulso/domain';
import { IconSearch, IconBarcode, IconCheck, IconAlert } from '@pulso/icons';

export const SalesScreen: React.FC = () => {
  const auth = useOptionalAuth();
  const session = auth?.session ?? null;
  const {
    items,
    connectionStatus,
    isTenderOpen,
    isSubmittingSale,
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

  const {
    products,
    quickProducts,
    isLoading: isCatalogLoading,
    error: catalogError,
    loadPosCatalog,
    searchPosProducts,
  } = useCatalogStore();

  const { activeShift, loadActiveShift } = useCashStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [remoteMatches, setRemoteMatches] = useState<CatalogProductItem[] | null>(null);
  const [scanFeedback, setScanFeedback] = useState<'idle' | 'success' | 'error'>('idle');
  const [scanMessage, setScanMessage] = useState('Listo para escanear');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeQueryIdRef = useRef(0);

  const playScanTone = (success: boolean) => {
    // Scanner feedback must remain useful without relying on color alone.
    try {
      const AudioContextCtor = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = success ? 880 : 180;
      oscillator.type = 'square';
      gain.gain.setValueAtTime(0.035, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.09);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.09);
    } catch {
      // Audio may be blocked by browser policy; visual and aria feedback remain.
    }
  };

  const announceScan = (kind: 'success' | 'error', message: string) => {
    setScanFeedback(kind);
    setScanMessage(message);
    playScanTone(kind === 'success');
  };

  useEffect(() => {
    if (session?.tenant?.id && session?.location?.id) {
      loadPosCatalog(session.tenant.id, session.location.id, connectionStatus === 'offline');
    }
  }, [session?.tenant?.id, session?.location?.id, connectionStatus, loadPosCatalog]);

  const trimmed = searchQuery.trim();
  const normalizedQ = normalizeSearchText(trimmed);

  // Strictly filter for vendible products (active and available in this branch)
  const vendibleProducts = products.filter((p) => p.isActive && p.isAvailable);
  const vendibleQuick = quickProducts.filter((p) => p.isActive && p.isAvailable);

  // Debounced dynamic search against API / IndexedDB for full catalog (> 100 products)
  useEffect(() => {
    if (!trimmed) {
      setRemoteMatches(null);
      return;
    }

    const queryId = activeQueryIdRef.current;
    let isMounted = true;
    const timer = setTimeout(async () => {
      if (!session?.tenant?.id || !session?.location?.id) return;
      try {
        const results = await searchPosProducts(
          session.tenant.id,
          session.location.id,
          trimmed,
          connectionStatus === 'offline'
        );
        if (isMounted && activeQueryIdRef.current === queryId) {
          setRemoteMatches(results.filter((p) => p.isActive && p.isAvailable));
        }
      } catch {
        // Ignored
      }
    }, 150);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [trimmed, session?.tenant?.id, session?.location?.id, connectionStatus, searchPosProducts]);

  const exactBarcodeMatches = vendibleProducts.filter((p) => p.barcode === trimmed);
  const otherMatches = vendibleProducts.filter((p) => {
    if (p.barcode === trimmed) return false;
    return (
      normalizeSearchText(p.name).includes(normalizedQ) ||
      (p.barcode && p.barcode.includes(trimmed)) ||
      (p.sku && p.sku.toLowerCase().includes(trimmed.toLowerCase()))
    );
  });

  const localMatches = [...exactBarcodeMatches, ...otherMatches];

  const filteredProducts: CatalogProductItem[] =
    trimmed !== ''
      ? remoteMatches !== null
        ? remoteMatches
        : localMatches
      : vendibleQuick.length > 0
        ? vendibleQuick
        : vendibleProducts.slice(0, 8);

  const totalCents = items.reduce((acc, it) => acc + it.totalPriceCents, 0);
  const totalFormatted = Money.fromCents(totalCents).format();

  const handleQueryChange = (val: string) => {
    activeQueryIdRef.current++;
    setSearchQuery(val);
    setRemoteMatches(null);
    setSelectedIndex(0);
    if (errorMessage) {
      dismissError();
    }
  };

  const handleInputKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
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

      let selectedProduct: CatalogProductItem | undefined =
        filteredProducts[selectedIndex] || filteredProducts[0];

      // If not found in current view, perform an immediate lookup before reporting not found
      if (!selectedProduct && trimmed !== '' && session?.tenant?.id && session?.location?.id) {
        try {
          const results = await searchPosProducts(
            session.tenant.id,
            session.location.id,
            trimmed,
            connectionStatus === 'offline'
          );
          const vendible = results.filter((p) => p.isActive && p.isAvailable);
          selectedProduct = vendible.find((p) => p.barcode === trimmed) || vendible[0];
        } catch {
          // Ignored
        }
      }

      if (!selectedProduct) {
        setErrorMessage(`Producto no encontrado para "${searchQuery}"`);
        announceScan('error', `No encontrado: ${searchQuery}`);
        return;
      }

      addItem({
        productId: selectedProduct.id,
        name: selectedProduct.name,
        barcode: selectedProduct.barcode || undefined,
        unitPriceCents: selectedProduct.salePriceCents,
      });
      setSearchQuery('');
      setRemoteMatches(null);
      setSelectedIndex(0);
      dismissError();
      announceScan('success', `Agregado: ${selectedProduct.name}`);
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
          if (!activeShift) {
            setErrorMessage(
              'No hay un turno de caja abierto en esta sucursal. Vaya a la sección CAJA para abrir turno antes de registrar cobros.'
            );
            return;
          }
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
          const quick =
            quickProducts.find((p) => p.quickSlot === num && p.isActive && p.isAvailable) ||
            products.find((p) => p.quickSlot === num && p.isActive && p.isAvailable);
          if (quick) {
            e.preventDefault();
            addItem({
              productId: quick.id,
              name: quick.name,
              barcode: quick.barcode || undefined,
              unitPriceCents: quick.salePriceCents,
            });
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
    quickProducts,
    products,
    openTender,
    dismissSuccess,
    addItem,
    activeShift,
    setErrorMessage,
  ]);

  // Handle Search / Barcode Form Submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredProducts.length === 0) {
      if (searchQuery.trim()) {
        setErrorMessage(`Producto no encontrado para "${searchQuery}"`);
        announceScan('error', `No encontrado: ${searchQuery}`);
      }
      return;
    }

    const selectedProduct = filteredProducts[selectedIndex] || filteredProducts[0];
    if (selectedProduct) {
      addItem({
        productId: selectedProduct.id,
        name: selectedProduct.name,
        barcode: selectedProduct.barcode || undefined,
        unitPriceCents: selectedProduct.salePriceCents,
      });
      setSearchQuery('');
      setSelectedIndex(0);
      dismissError();
      announceScan('success', `Agregado: ${selectedProduct.name}`);
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
            <button
              type="button"
              aria-label="Activar escáner"
              title="Enfocar lector (F2)"
              onClick={() => searchInputRef.current?.focus()}
              style={{ display: 'grid', placeItems: 'center', padding: 0, marginRight: '10px', border: 'none', background: 'transparent', color: 'var(--color-ink)', cursor: 'pointer' }}
            >
              <IconBarcode size={24} />
            </button>
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
          <div aria-live="polite" aria-atomic="true" style={{
            marginTop: '6px', minHeight: '20px',
            color: scanFeedback === 'error' ? 'var(--color-tomato-solid)' : 'var(--color-ink-muted)',
            fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 700,
          }}>
            {scanFeedback === 'success' ? '✓ ' : scanFeedback === 'error' ? '⚠ ' : '⌁ '}
            {scanMessage} · F2 enfoca el lector · también podés buscar manualmente
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

          {isCatalogLoading && products.length === 0 ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                backgroundColor: 'var(--color-surface-sunken)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-ink-muted)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
              }}
            >
              Cargando productos del catálogo...
            </div>
          ) : catalogError && products.length === 0 ? (
            <div
              role="alert"
              style={{
                padding: '24px 16px',
                textAlign: 'center',
                backgroundColor: 'var(--color-surface-sunken)',
                border: '2px solid var(--color-danger-solid)',
                color: 'var(--color-ink)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
              }}
            >
              <div>{catalogError}</div>
              <button
                type="button"
                onClick={() =>
                  session &&
                  loadPosCatalog(
                    session.tenant.id,
                    session.location.id,
                    connectionStatus === 'offline'
                  )
                }
                style={{
                  marginTop: '10px',
                  padding: '6px 14px',
                  backgroundColor: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                  fontWeight: 800,
                  borderRadius: 'var(--radius-xs)',
                }}
              >
                Reintentar
              </button>
            </div>
          ) : products.length === 0 && quickProducts.length === 0 && !searchQuery.trim() ? (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: '36px 16px',
                textAlign: 'center',
                backgroundColor: 'var(--color-surface-sunken)',
                border: '2px dashed var(--color-border)',
                color: 'var(--color-ink-muted)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
              }}
            >
              No hay productos registrados en esta sucursal. Cargá tu catálogo desde la sección
              Productos.
            </div>
          ) : filteredProducts.length === 0 ? (
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
                    key={prod.id}
                    type="button"
                    onClick={() => {
                      addItem({
                        productId: prod.id,
                        name: prod.name,
                        barcode: prod.barcode || undefined,
                        unitPriceCents: prod.salePriceCents,
                      });
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
                          textTransform: 'uppercase',
                        }}
                      >
                        {prod.category}
                      </span>
                      {!isSearching && prod.quickSlot && (
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
                          [{prod.quickSlot}]
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

                    {/* Price and Stock */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        marginTop: '8px',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          fontSize: 'var(--text-base)',
                          color: 'var(--color-ink)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {Money.fromCents(prod.salePriceCents).format()}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-ink-muted)',
                        }}
                      >
                        Stk: {parseFloat(prod.stockQuantity).toFixed(0)}
                      </span>
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
          onClick={() => {
            if (items.length === 0) return;
            if (!activeShift) {
              setErrorMessage(
                'No hay un turno de caja abierto en esta sucursal. Vaya a la sección CAJA para abrir turno antes de registrar cobros.'
              );
              return;
            }
            openTender();
          }}
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
            isSubmitting={isSubmittingSale}
            onConfirmTender={async ({ receivedCents, changeCents }) => {
              if (!session?.tenant?.id || !session?.location?.id) {
                setErrorMessage('No hay contexto de sucursal activo para procesar la venta.');
                return;
              }
              if (!activeShift) {
                setErrorMessage(
                  'No hay un turno de caja abierto en esta sucursal. Vaya a la sección CAJA para abrir turno antes de registrar cobros.'
                );
                return;
              }
              try {
                await processCashPayment(receivedCents, changeCents, {
                  tenantId: session.tenant.id,
                  locationId: session.location.id,
                  shiftId: activeShift.id,
                });
                await loadActiveShift({
                  tenantId: session.tenant.id,
                  locationId: session.location.id,
                });
              } catch (err: unknown) {
                if (err instanceof Error) {
                  setErrorMessage(err.message);
                }
              }
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

            {lastSaleSuccess.warnings && lastSaleSuccess.warnings.length > 0 && (
              <div
                style={{
                  backgroundColor: 'rgba(234, 179, 8, 0.15)',
                  border: '1px solid #eab308',
                  borderRadius: 'var(--radius-xs)',
                  padding: '8px 12px',
                  marginBottom: '16px',
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-ink)',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <IconAlert size={14} />
                  <span>Aviso de stock:</span>
                </div>
                {lastSaleSuccess.warnings.map((w) => (
                  <div key={w.productId}>
                    {w.name}: stock {w.currentStock} {w.belowZero ? '(negativo)' : '(bajo mínimo)'}
                  </div>
                ))}
              </div>
            )}

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
