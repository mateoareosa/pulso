import React from 'react';
import { IconBarcode, IconSale } from '@pulso/icons';

export interface ReceiptItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPriceFormatted: string;
  totalPriceFormatted: string;
  barcode?: string;
}

export interface LiveReceiptProps {
  items: ReceiptItem[];
  totalFormatted: string;
  selectedItemId?: string;
  onSelectItem?: (id: string) => void;
  onRemoveItem?: (id: string) => void;
  onQuantityChange?: (id: string, delta: number) => void;
  className?: string;
}

export const LiveReceipt: React.FC<LiveReceiptProps> = ({
  items,
  totalFormatted,
  selectedItemId,
  onSelectItem,
  onRemoveItem,
  onQuantityChange,
  className = '',
}) => {
  const isEmpty = items.length === 0;

  return (
    <div
      className={`live-receipt-container ${className}`}
      style={{
        backgroundColor: 'var(--color-ticket)',
        color: 'var(--color-ink)',
        border: '2px solid var(--color-ink)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: '480px',
        boxShadow: 'var(--shadow-receipt)',
        fontFamily: 'var(--font-mono)',
        position: 'relative',
      }}
    >
      {/* Thermal Ticket Header with torn edge rhythm */}
      <div
        style={{
          borderBottom: '2px dashed var(--color-ink)',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          backgroundColor: 'var(--color-ticket-edge)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconSale size={18} />
          <span style={{ fontWeight: 800, letterSpacing: '1px', fontSize: '0.9rem' }}>
            TICKET DE VENTA
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>
          {isEmpty
            ? '0 ARTÍCULOS'
            : `${items.length} ${items.length === 1 ? 'ARTÍCULO' : 'ARTÍCULOS'}`}
        </span>
      </div>

      {/* Items Section */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {isEmpty ? (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-ink-muted)',
              gap: '12px',
              padding: '32px 0',
              textAlign: 'center',
            }}
          >
            <IconBarcode size={36} />
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--color-ink)' }}>
              Esperando productos...
            </div>
            <p style={{ fontSize: '0.8rem', maxWidth: '240px', lineHeight: 1.4 }}>
              Escaneá código de barras o buscá con{' '}
              <kbd
                style={{
                  padding: '2px 6px',
                  border: '1px solid var(--color-ink)',
                  borderRadius: '2px',
                }}
              >
                F2
              </kbd>
            </p>
          </div>
        ) : (
          items.map((item, idx) => {
            const isSelected = item.id === selectedItemId;
            return (
              <div
                key={item.id}
                onClick={() => onSelectItem?.(item.id)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  backgroundColor: isSelected ? 'var(--color-pulse-subtle)' : 'transparent',
                  border: isSelected ? '1px solid var(--color-pulse)' : '1px solid transparent',
                  borderBottom: '1px dotted var(--color-border)',
                  cursor: 'pointer',
                  transition: 'background-color 120ms ease',
                }}
              >
                <div style={{ flex: 1, minWidth: 0, paddingRight: '8px' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    <span style={{ opacity: 0.6, marginRight: '6px' }}>{idx + 1}.</span>
                    <span>{item.name}</span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--color-ink-muted)',
                      marginTop: '2px',
                    }}
                  >
                    {item.quantity}x {item.unitPriceFormatted}
                    {item.barcode && (
                      <span style={{ marginLeft: '8px', opacity: 0.7 }}>[{item.barcode}]</span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {onQuantityChange && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuantityChange(item.id, -1);
                        }}
                        style={{
                          width: '24px',
                          height: '24px',
                          border: '1px solid var(--color-ink)',
                          backgroundColor: 'var(--color-ticket)',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                        aria-label={`Restar una unidad de ${item.name}`}
                      >
                        -
                      </button>
                      <span
                        style={{
                          fontWeight: 700,
                          minWidth: '18px',
                          textAlign: 'center',
                          fontSize: '0.85rem',
                        }}
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuantityChange(item.id, 1);
                        }}
                        style={{
                          width: '24px',
                          height: '24px',
                          border: '1px solid var(--color-ink)',
                          backgroundColor: 'var(--color-ticket)',
                          cursor: 'pointer',
                          fontWeight: 700,
                        }}
                        aria-label={`Sumar una unidad de ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                  )}

                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '0.95rem',
                      minWidth: '80px',
                      textAlign: 'right',
                    }}
                  >
                    {item.totalPriceFormatted}
                  </div>

                  {onRemoveItem && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveItem(item.id);
                      }}
                      aria-label={`Quitar ${item.name}`}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-tomato)',
                        cursor: 'pointer',
                        fontWeight: 900,
                        padding: '2px 6px',
                        fontSize: '1rem',
                      }}
                      title="Eliminar ítem"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Grand Total Footer */}
      <div
        style={{
          borderTop: '2px solid var(--color-ink)',
          backgroundColor: 'var(--color-ticket-edge)',
          padding: '16px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <span style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '1px' }}>TOTAL</span>
          <span
            style={{
              fontWeight: 900,
              fontSize: '1.8rem',
              color: 'var(--color-ink)',
              letterSpacing: '-0.5px',
            }}
          >
            {totalFormatted}
          </span>
        </div>
      </div>
    </div>
  );
};
