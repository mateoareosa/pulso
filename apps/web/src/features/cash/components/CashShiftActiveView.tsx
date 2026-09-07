import React, { useState } from 'react';
import { Money } from '@pulso/domain';
import type { CashShiftResponse } from '@pulso/contracts';
import { CashMovementModal } from './CashMovementModal';
import { CashShiftCloseModal } from './CashShiftCloseModal';
import { IconCash, IconAlert } from '@pulso/icons';

interface CashShiftActiveViewProps {
  shift: CashShiftResponse;
  isOffline: boolean;
  isSubmitting: boolean;
  pendingOfflineSalesCount?: number;
  onCashIn: (amountCents: number, reason: string) => Promise<boolean>;
  onCashOut: (amountCents: number, reason: string) => Promise<boolean>;
  onCloseShift: (countedAmountCents: number) => Promise<boolean>;
}

export const CashShiftActiveView: React.FC<CashShiftActiveViewProps> = ({
  shift,
  isOffline,
  isSubmitting,
  pendingOfflineSalesCount = 0,
  onCashIn,
  onCashOut,
  onCloseShift,
}) => {
  const [modalType, setModalType] = useState<'CASH_IN' | 'CASH_OUT' | 'CLOSE' | null>(null);

  const summary = shift.summary || {
    openingAmountCents: shift.openingAmountCents,
    cashSalesAmountCents: 0,
    cashInAmountCents: 0,
    cashOutAmountCents: 0,
    expectedAmountCents: shift.openingAmountCents,
    movementsCount: shift.movements?.length ?? 0,
    salesCount: 0,
  };

  const openedDate = new Date(shift.openedAtUtc);
  const openedFormatted = `${openedDate.toLocaleDateString('es-AR')} ${openedDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  const openedByName = shift.openedByUser?.name || 'Operador';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        padding: '16px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Top Banner & Status */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          borderBottom: '1px solid var(--color-border, rgba(0,0,0,0.12))',
          paddingBottom: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{
                display: 'inline-block',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: 'var(--color-success, #28a745)',
              }}
            />
            <span
              style={{
                fontSize: 'var(--text-xs, 12px)',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-success, #28a745)',
              }}
            >
              TURNO DE CAJA ABIERTO
            </span>
          </div>
          <h1 style={{ fontSize: 'var(--text-xl, 22px)', fontWeight: 900, margin: '2px 0 0' }}>
            Control Operativo de Caja
          </h1>
          <div style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-ink-muted, #666)' }}>
            Iniciado por <strong>{openedByName}</strong> el {openedFormatted}
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="open-cash-in-modal-button"
            disabled={isSubmitting || isOffline}
            onClick={() => setModalType('CASH_IN')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 800,
              backgroundColor: 'var(--color-surface, #fff)',
              color: 'var(--color-ink, #000)',
              border: '1px solid var(--color-border, #ccc)',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor: isSubmitting || isOffline ? 'not-allowed' : 'pointer',
              minHeight: '38px',
            }}
          >
            <IconCash size={16} />
            <span>+ INGRESO</span>
          </button>

          <button
            type="button"
            data-testid="open-cash-out-modal-button"
            disabled={isSubmitting || isOffline}
            onClick={() => setModalType('CASH_OUT')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 800,
              backgroundColor: 'var(--color-surface, #fff)',
              color: 'var(--color-ink, #000)',
              border: '1px solid var(--color-border, #ccc)',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor: isSubmitting || isOffline ? 'not-allowed' : 'pointer',
              minHeight: '38px',
            }}
          >
            <IconCash size={16} />
            <span>- RETIRO</span>
          </button>

          <button
            type="button"
            data-testid="open-close-shift-modal-button"
            disabled={isSubmitting || isOffline}
            onClick={() => setModalType('CLOSE')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 900,
              backgroundColor: 'var(--color-brand, #0066cc)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor: isSubmitting || isOffline ? 'not-allowed' : 'pointer',
              minHeight: '38px',
              letterSpacing: '0.04em',
            }}
          >
            <span>CERRAR CAJA / ARQUEO</span>
          </button>
        </div>
      </div>

      {isOffline && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: '#fff3cd',
            color: '#856404',
            border: '1px solid #ffeeba',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '10px 14px',
            fontSize: 'var(--text-xs, 12px)',
            fontWeight: 700,
          }}
        >
          <IconAlert size={16} />
          <span>
            Sin conexión. Las operaciones de ingreso, retiro y cierre de caja están deshabilitadas
            hasta restablecer la comunicación con el servidor.
          </span>
        </div>
      )}

      {pendingOfflineSalesCount > 0 && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(0, 86, 179, 0.1)',
            color: '#0056b3',
            border: '1px solid rgba(0, 86, 179, 0.25)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '10px 14px',
            fontSize: 'var(--text-xs, 12px)',
            fontWeight: 700,
          }}
        >
          <IconAlert size={16} />
          <span>
            Hay <strong>{pendingOfflineSalesCount}</strong> venta(s) offline en cola. Al sincronizar
            con el servidor, su efectivo se incorporará automáticamente al saldo confirmado de caja.
          </span>
        </div>
      )}

      {/* KPI Cards Ledger */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Fondo Inicial */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-border, #ddd)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #666)',
              textTransform: 'uppercase',
            }}
          >
            Fondo Inicial
          </div>
          <div
            data-testid="kpi-opening-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-lg, 18px)',
              fontWeight: 900,
              marginTop: '4px',
            }}
          >
            {Money.fromCents(summary.openingAmountCents).format()}
          </div>
        </div>

        {/* Ventas Efectivo */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-border, #ddd)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #666)',
              textTransform: 'uppercase',
            }}
          >
            Ventas Efectivo ({summary.salesCount})
          </div>
          <div
            data-testid="kpi-cash-sales-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-lg, 18px)',
              fontWeight: 900,
              marginTop: '4px',
              color: 'var(--color-success, #28a745)',
            }}
          >
            + {Money.fromCents(summary.cashSalesAmountCents).format()}
          </div>
        </div>

        {/* Ingresos Manuales */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-border, #ddd)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #666)',
              textTransform: 'uppercase',
            }}
          >
            Ingresos Manuales
          </div>
          <div
            data-testid="kpi-cash-in-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-lg, 18px)',
              fontWeight: 900,
              marginTop: '4px',
              color: 'var(--color-brand, #0066cc)',
            }}
          >
            + {Money.fromCents(summary.cashInAmountCents).format()}
          </div>
        </div>

        {/* Retiros Manuales */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #fff)',
            border: '1px solid var(--color-border, #ddd)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #666)',
              textTransform: 'uppercase',
            }}
          >
            Retiros Manuales
          </div>
          <div
            data-testid="kpi-cash-out-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-lg, 18px)',
              fontWeight: 900,
              marginTop: '4px',
              color: 'var(--color-danger, #dc3545)',
            }}
          >
            - {Money.fromCents(summary.cashOutAmountCents).format()}
          </div>
        </div>

        {/* Saldo Esperado en Caja (Hero) */}
        <div
          style={{
            backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.04))',
            border: '2px solid var(--color-ink, #000)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '12px 16px',
            gridColumn: 'span 1',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 800,
              color: 'var(--color-ink, #000)',
              textTransform: 'uppercase',
            }}
          >
            Saldo Esperado en Caja
          </div>
          <div
            data-testid="kpi-expected-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-xl, 22px)',
              fontWeight: 900,
              marginTop: '4px',
              color: 'var(--color-ink, #000)',
            }}
          >
            {Money.fromCents(summary.expectedAmountCents).format()}
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div
        style={{
          backgroundColor: 'var(--color-surface, #fff)',
          border: '1px solid var(--color-border, #ddd)',
          borderRadius: 'var(--radius-md, 8px)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.02))',
            borderBottom: '1px solid var(--color-border, #ddd)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h3 style={{ fontSize: 'var(--text-sm, 14px)', fontWeight: 800, margin: 0 }}>
            Movimientos del Turno ({shift.movements?.length ?? 0})
          </h3>
          <span style={{ fontSize: 'var(--text-xs, 11px)', color: 'var(--color-ink-muted, #666)' }}>
            Ledger cronológico inmutable
          </span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table
            data-testid="cash-movements-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--text-xs, 12px)',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--color-border, #eee)',
                  color: 'var(--color-ink-muted, #666)',
                }}
              >
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>HORA</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>TIPO</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>MOTIVO / DETALLE</th>
                <th style={{ padding: '10px 14px', fontWeight: 800 }}>USUARIO</th>
                <th style={{ padding: '10px 14px', fontWeight: 800, textAlign: 'right' }}>MONTO</th>
              </tr>
            </thead>
            <tbody>
              {!shift.movements || shift.movements.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      padding: '24px',
                      textAlign: 'center',
                      color: 'var(--color-ink-muted, #666)',
                    }}
                  >
                    No hay movimientos registrados en este turno.
                  </td>
                </tr>
              ) : (
                shift.movements.map((m) => {
                  const mTime = new Date(m.createdAtUtc);
                  const timeFormatted = mTime.toLocaleTimeString('es-AR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  let typeLabel: string = m.type;
                  let typeColor = 'var(--color-ink)';
                  let sign = '';

                  if (m.type === 'OPENING') {
                    typeLabel = 'APERTURA';
                    typeColor = '#6c757d';
                    sign = '+';
                  } else if (m.type === 'SALE') {
                    typeLabel = 'VENTA';
                    typeColor = 'var(--color-success, #28a745)';
                    sign = '+';
                  } else if (m.type === 'CASH_IN') {
                    typeLabel = 'INGRESO';
                    typeColor = 'var(--color-brand, #0066cc)';
                    sign = '+';
                  } else if (m.type === 'CASH_OUT') {
                    typeLabel = 'RETIRO';
                    typeColor = 'var(--color-danger, #dc3545)';
                    sign = '-';
                  }

                  return (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: '1px solid var(--color-border, #f0f0f0)',
                      }}
                    >
                      <td
                        style={{ padding: '10px 14px', fontFamily: 'monospace, var(--font-mono)' }}
                      >
                        {timeFormatted}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-xs, 4px)',
                            backgroundColor: 'rgba(0,0,0,0.06)',
                            fontWeight: 800,
                            color: typeColor,
                          }}
                        >
                          {typeLabel}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px' }}>{m.reason || '—'}</td>
                      <td style={{ padding: '10px 14px' }}>{m.createdByUser?.name || '—'}</td>
                      <td
                        style={{
                          padding: '10px 14px',
                          textAlign: 'right',
                          fontFamily: 'monospace, var(--font-mono)',
                          fontWeight: 800,
                          color: typeColor,
                        }}
                      >
                        {sign} {Money.fromCents(m.amountCents).format()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {(modalType === 'CASH_IN' || modalType === 'CASH_OUT') && (
        <CashMovementModal
          type={modalType}
          currentExpectedCents={summary.expectedAmountCents}
          isSubmitting={isSubmitting}
          onConfirm={modalType === 'CASH_IN' ? onCashIn : onCashOut}
          onClose={() => setModalType(null)}
        />
      )}

      {modalType === 'CLOSE' && (
        <CashShiftCloseModal
          expectedAmountCents={summary.expectedAmountCents}
          isSubmitting={isSubmitting}
          onConfirmClose={onCloseShift}
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  );
};
