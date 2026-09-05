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
          fontFamily: 'var(--font-sans)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <IconSale size={18} />
          <span style={{ fontWeight: 800, letterSpacing: '1px', fontSize: 'var(--text-sm)' }}>
            TICKET DE VENTA
          </span>
        </div>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
            color: 'var(--color-ink-muted)',
            textTransform: 'uppercase',
          }}
        >
          {isEmpty
            ? '0 ARTÍCULOS'
            : `${items.length} ${items.length === 1 ? 'ARTÍCULO' : 'ARTÍCULOS'}`}
        </span>
      </div>

      {/* Items Scrollable Section */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
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
              padding: '40px 0',
              textAlign: 'center',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <IconBarcode size={40} style={{ opacity: 0.7 }} />
            <div
              style={{
                fontWeight: 700,
                fontSize: 'var(--text-base)',
                color: 'var(--color-ink)',
              }}
            >
              Esperando productos...
            </div>
            <p
              style={{
                fontSize: 'var(--text-xs)',
                maxWidth: '260px',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Escaneá código de barras o buscá con <kbd>F2</kbd>
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
                  backgroundColor: isSelected ? 'var(--color-pulse-soft)' : 'transparent',
                  border: isSelected
                    ? '1px solid var(--color-pulse-border)'
                    : '1px solid transparent',
                  borderLeft: isSelected
                    ? '4px solid var(--color-pulse-solid)'
                    : '4px solid transparent',
                  borderBottom: '1px dotted var(--color-border)',
                  cursor: 'pointer',
                  transition:
                    'background-color var(--duration-fast) ease, border-color var(--duration-fast) ease',
                }}
              >
                {/* Product Name & Info (Humanist Sans) */}
                <div style={{ flex: 1, minWidth: 0, paddingRight: '10px' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-sans)',
                      fontWeight: 700,
                      fontSize: 'var(--text-sm)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: 'var(--color-ink)',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        opacity: 0.6,
                        marginRight: '6px',
                        fontSize: 'var(--text-xs)',
                      }}
                    >
                      {idx + 1}.
                    </span>
                    <span>{item.name}</span>
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-ink-muted)',
                      marginTop: '3px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span>
                      {item.quantity}x {item.unitPriceFormatted}
                    </span>
                    {item.barcode && <span style={{ opacity: 0.75 }}>[{item.barcode}]</span>}
                  </div>
                </div>

                {/* Quantity Controls & Line Total (Tabular figures) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {onQuantityChange && (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                      role="group"
                      aria-label={`Modificar cantidad de ${item.name}`}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onQuantityChange(item.id, -1);
                        }}
                        style={{
                          width: '28px',
                          height: '28px',
                          border: '1px solid var(--color-ink)',
                          backgroundColor: 'var(--color-ticket)',
                          color: 'var(--color-ink)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 'var(--text-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        aria-label={`Restar una unidad de ${item.name}`}
                      >
                        -
                      </button>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          minWidth: '22px',
                          textAlign: 'center',
                          fontSize: 'var(--text-sm)',
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
                          width: '28px',
                          height: '28px',
                          border: '1px solid var(--color-ink)',
                          backgroundColor: 'var(--color-ticket)',
                          color: 'var(--color-ink)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: 'var(--text-sm)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        aria-label={`Sumar una unidad de ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                  )}

                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      fontSize: 'var(--text-base)',
                      minWidth: '85px',
                      textAlign: 'right',
                      letterSpacing: '-0.3px',
                      fontVariantNumeric: 'tabular-nums',
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
                        width: '28px',
                        height: '28px',
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-tomato-text)',
                        cursor: 'pointer',
                        fontWeight: 900,
                        fontSize: 'var(--text-lg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
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

      {/* Grand Total Footer (Fixed at bottom) */}
      <div
        style={{
          borderTop: '2px solid var(--color-ink)',
          backgroundColor: 'var(--color-ticket-edge)',
          padding: '16px 20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontWeight: 800,
              fontSize: 'var(--text-base)',
              letterSpacing: '1px',
              textTransform: 'uppercase',
            }}
          >
            TOTAL
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              fontSize: 'var(--text-3xl)',
              color: 'var(--color-ink)',
              letterSpacing: '-0.5px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {totalFormatted}
          </span>
        </div>
      </div>
    </div>
  );
};
