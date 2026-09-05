import React from 'react';
import { Money } from '@pulso/domain';
import { IconClose } from '@pulso/icons';
import type { CatalogProductItem } from '../store/catalog.store';

export interface QuickSlotsRibbonProps {
  products: CatalogProductItem[];
  onOpenEdit: (product: CatalogProductItem) => void;
  onAssignQuickSlot: (slot: number) => void;
}

export const QuickSlotsRibbon: React.FC<QuickSlotsRibbonProps> = ({
  products,
  onOpenEdit,
  onAssignQuickSlot,
}) => {
  return (
    <section
      aria-label="Cinta de atajos rápidos 1 a 8"
      style={{
        marginBottom: '20px',
        backgroundColor: 'var(--color-surface-sunken)',
        border: '1px solid var(--color-border)',
        padding: '12px',
        borderRadius: 'var(--radius-xs)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--text-xs)',
          fontWeight: 800,
          textTransform: 'uppercase',
          color: 'var(--color-ink-muted)',
          marginBottom: '8px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <span>CINTA DE PRODUCTOS RÁPIDOS EN MOSTRADOR (SLOTS 1 AL 8)</span>
        <span style={{ fontFamily: 'var(--font-mono)' }}>Atajos [1] a [8]</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '8px',
        }}
      >
        {[1, 2, 3, 4, 5, 6, 7, 8].map((slotNum) => {
          const occupant = products.find((p) => p.quickSlot === slotNum);
          return (
            <div
              key={slotNum}
              onClick={() => occupant && onOpenEdit(occupant)}
              style={{
                backgroundColor: occupant ? 'var(--color-surface)' : 'transparent',
                border: occupant
                  ? '1px solid var(--color-border)'
                  : '1px dashed var(--color-border)',
                padding: '8px',
                borderRadius: 'var(--radius-xs)',
                minHeight: '64px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                cursor: occupant ? 'pointer' : 'default',
                position: 'relative',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 800,
                    backgroundColor: 'var(--color-surface-sunken)',
                    border: '1px solid var(--color-border)',
                    padding: '0 4px',
                    borderRadius: 'var(--radius-xs)',
                    color: 'var(--color-ink)',
                  }}
                >
                  [{slotNum}]
                </span>
                {occupant && (
                  <button
                    type="button"
                    title="Liberar slot"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAssignQuickSlot(slotNum);
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--color-ink-muted)',
                      cursor: 'pointer',
                      padding: '2px',
                    }}
                  >
                    <IconClose size={12} />
                  </button>
                )}
              </div>

              <div
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: occupant ? 'var(--color-ink)' : 'var(--color-ink-muted)',
                  marginTop: '4px',
                }}
              >
                {occupant ? occupant.name : '(Vacío)'}
              </div>

              {occupant && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 800,
                    color: 'var(--color-ink)',
                  }}
                >
                  {Money.fromCents(occupant.salePriceCents).format()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};
