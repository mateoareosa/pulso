import React from 'react';
import { IconClose } from '@pulso/icons';
import type { StockMovementResponse } from '@pulso/contracts';
import type { CatalogProductItem } from '../store/catalog.store';

export interface InventoryHistoryDialogProps {
  isOpen: boolean;
  historyProduct: CatalogProductItem | null;
  movements: StockMovementResponse[];
  isHistoryLoading: boolean;
  onClose: () => void;
}

export const InventoryHistoryDialog: React.FC<InventoryHistoryDialogProps> = ({
  isOpen,
  historyProduct,
  movements,
  isHistoryLoading,
  onClose,
}) => {
  if (!isOpen || !historyProduct) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Historial de Movimientos"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '2px solid var(--color-border)',
          borderRadius: 'var(--radius-xs)',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: 'var(--shadow-key)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '2px solid var(--color-border)',
            paddingBottom: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 800 }}>
              HISTORIAL DE MOVIMIENTOS
            </h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              {historyProduct.name}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-ink)',
            }}
          >
            <IconClose size={20} />
          </button>
        </div>

        {isHistoryLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
            Cargando historial de movimientos...
          </div>
        ) : movements.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-ink-muted)' }}>
            No hay movimientos registrados para este producto.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}
            >
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--color-surface-sunken)',
                    borderBottom: '1px solid var(--color-border)',
                    textAlign: 'left',
                    fontWeight: 800,
                  }}
                >
                  <th style={{ padding: '8px' }}>Fecha</th>
                  <th style={{ padding: '8px' }}>Tipo</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Delta</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Stock Final</th>
                  <th style={{ padding: '8px' }}>Motivo</th>
                  <th style={{ padding: '8px' }}>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const deltaNum = parseFloat(m.delta);
                  const isPositive = deltaNum > 0;
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px', fontFamily: 'var(--font-mono)' }}>
                        {new Date(m.createdAt).toLocaleDateString()}{' '}
                        {new Date(m.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td style={{ padding: '8px', fontWeight: 700 }}>{m.type}</td>
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                          color: isPositive
                            ? 'var(--color-pulse-text)'
                            : 'var(--color-danger, #D32F2F)',
                        }}
                      >
                        {isPositive ? `+${deltaNum.toFixed(0)}` : deltaNum.toFixed(0)}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {parseFloat(m.resultingStock).toFixed(0)}
                      </td>
                      <td style={{ padding: '8px' }}>{m.reason}</td>
                      <td style={{ padding: '8px', color: 'var(--color-ink-muted)' }}>
                        {m.user?.name || m.userId}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
