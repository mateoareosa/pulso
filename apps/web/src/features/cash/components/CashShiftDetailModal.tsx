import React, { useEffect } from 'react';
import { Money } from '@pulso/domain';
import type { CashShiftResponse } from '@pulso/contracts';
import { IconClose } from '@pulso/icons';

interface CashShiftDetailModalProps {
  shift: CashShiftResponse | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}

export const CashShiftDetailModal: React.FC<CashShiftDetailModalProps> = ({
  shift,
  isLoading,
  error,
  onClose,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!shift && !isLoading && !error) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Detalle de turno de caja"
      data-testid="shift-detail-modal"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface, #fff)',
          border: '1px solid var(--color-border, rgba(0,0,0,0.2))',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '24px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--color-border, #eee)',
            paddingBottom: '12px',
            marginBottom: '16px',
          }}
        >
          <div>
            <h2 style={{ fontSize: 'var(--text-lg, 18px)', fontWeight: 900, margin: 0 }}>
              Detalle de Turno #{shift?.id ? shift.id.slice(-6) : ''}
            </h2>
            <div
              style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-ink-muted, #666)' }}
            >
              Estado: <strong>{shift?.status === 'OPEN' ? 'ABIERTO' : 'CERRADO'}</strong>
            </div>
          </div>
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-ink-muted, #666)',
              padding: '4px',
            }}
          >
            <IconClose size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {isLoading && (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: 'var(--color-ink-muted, #666)',
              }}
            >
              Cargando detalle del turno...
            </div>
          )}

          {error && (
            <div
              role="alert"
              style={{
                backgroundColor: 'rgba(220, 53, 69, 0.12)',
                color: 'var(--color-danger-solid)',
                padding: '12px',
                borderRadius: '4px',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          {shift && !isLoading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Summary stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                  backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.03))',
                  padding: '12px',
                  borderRadius: '4px',
                  fontSize: 'var(--text-xs, 12px)',
                }}
              >
                <div>
                  <div style={{ color: 'var(--color-ink-muted, #666)' }}>Fondo Inicial:</div>
                  <div style={{ fontWeight: 800, fontFamily: 'monospace, var(--font-mono)' }}>
                    {Money.fromCents(shift.openingAmountCents).format()}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-ink-muted, #666)' }}>Efectivo Esperado:</div>
                  <div style={{ fontWeight: 800, fontFamily: 'monospace, var(--font-mono)' }}>
                    {Money.fromCents(
                      shift.expectedAmountCents ?? shift.summary?.expectedAmountCents ?? 0
                    ).format()}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--color-ink-muted, #666)' }}>Efectivo Contado:</div>
                  <div style={{ fontWeight: 800, fontFamily: 'monospace, var(--font-mono)' }}>
                    {shift.countedAmountCents != null
                      ? Money.fromCents(shift.countedAmountCents).format()
                      : '—'}
                  </div>
                </div>
              </div>

              {/* Movements List */}
              <h3 style={{ fontSize: 'var(--text-sm, 14px)', fontWeight: 800, margin: '8px 0 0' }}>
                Movimientos Registrados ({shift.movements?.length ?? 0})
              </h3>

              <div
                style={{
                  border: '1px solid var(--color-border, #eee)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 'var(--text-xs, 12px)',
                  }}
                >
                  <thead>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--color-border, #eee)',
                        backgroundColor: 'rgba(0,0,0,0.02)',
                      }}
                    >
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>HORA</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>TIPO</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>MOTIVO</th>
                      <th style={{ padding: '8px 10px', textAlign: 'left' }}>USUARIO</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>MONTO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!shift.movements || shift.movements.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{ padding: '16px', textAlign: 'center', color: '#888' }}
                        >
                          Sin movimientos.
                        </td>
                      </tr>
                    ) : (
                      shift.movements.map((m) => {
                        const mTime = new Date(m.createdAtUtc);
                        const timeStr = mTime.toLocaleTimeString('es-AR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        });
                        return (
                          <tr key={m.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td
                              style={{
                                padding: '8px 10px',
                                fontFamily: 'monospace, var(--font-mono)',
                              }}
                            >
                              {timeStr}
                            </td>
                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>{m.type}</td>
                            <td style={{ padding: '8px 10px' }}>{m.reason || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>{m.createdByUser?.name || '—'}</td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'monospace, var(--font-mono)',
                                fontWeight: 800,
                              }}
                            >
                              {Money.fromCents(m.amountCents).format()}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: '16px',
            paddingTop: '12px',
            borderTop: '1px solid var(--color-border, #eee)',
            textAlign: 'right',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 800,
              backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.06))',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border, #ccc)',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            CERRAR
          </button>
        </div>
      </div>
    </div>
  );
};
