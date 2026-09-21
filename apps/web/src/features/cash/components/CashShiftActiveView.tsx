import React, { useState } from 'react';
import { Money } from '@pulso/domain';
import type { CashShiftResponse } from '@pulso/contracts';
import { CashMovementModal } from './CashMovementModal';
import { CashShiftCloseModal } from './CashShiftCloseModal';
import { IconCash, IconAlert } from '@pulso/icons';
interface CashShiftActiveViewProps {
  shift: CashShiftResponse;
  isConfirmed?: boolean;
  isOffline: boolean;
  isSubmitting: boolean;
  pendingOfflineSalesCount?: number;
  onCashIn: (amountCents: number, reason: string) => Promise<boolean>;
  onCashOut: (amountCents: number, reason: string) => Promise<boolean>;
  onCloseShift: (countedAmountCents: number, motivo?: string) => Promise<boolean>;
}

export const CashShiftActiveView: React.FC<CashShiftActiveViewProps> = ({
  shift,
  isConfirmed = true,
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
    refundAmountCents: 0,
    expectedAmountCents: shift.openingAmountCents,
    movementsCount: shift.movements?.length ?? 0,
    salesCount: 0,
  };

  const openedDate = new Date(shift.openedAtUtc);
  const openedFormatted = `${openedDate.toLocaleDateString('es-AR')} ${openedDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  const openedByName = shift.openedByUser?.name || 'Operador';
  const purchaseAmountCents = (summary as typeof summary & { purchaseAmountCents?: number }).purchaseAmountCents ?? shift.movements
    ?.filter((movement) => movement.type === 'CASH_OUT' && (movement as typeof movement & { purchaseId?: string | null }).purchaseId)
    .reduce((total, movement) => total + movement.amountCents, 0) ?? 0;

  return (
    <div
      className="ticket-ledger-view ticket-ledger-action-first"
      role="region"
      aria-label="Operación de caja actual"
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
          borderBottom: '1px solid var(--color-border)',
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
                backgroundColor: 'var(--color-pulse-text)',
              }}
            />
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--color-pulse-text)',
              }}
            >
              TURNO DE CAJA ABIERTO
            </span>
          </div>
          <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 900, margin: '2px 0 0' }}>
            Control Operativo de Caja
          </h1>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
            Iniciado por <strong>{openedByName}</strong> el {openedFormatted}
          </div>
        </div>

        {/* Action Buttons */}
        <div
          className="ticket-ledger-actions"
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
        >
          <button
            type="button"
            className="ticket-ledger-control ticket-ledger-action"
            data-testid="open-cash-in-modal-button"
            disabled={isSubmitting || isOffline || !isConfirmed}
            onClick={() => setModalType('CASH_IN')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              cursor: isSubmitting || isOffline || !isConfirmed ? 'not-allowed' : 'pointer',
              minHeight: '38px',
            }}
          >
            <IconCash size={16} />
            <span>+ INGRESO</span>
          </button>

          <button
            type="button"
            className="ticket-ledger-control ticket-ledger-action"
            data-testid="open-cash-out-modal-button"
            disabled={isSubmitting || isOffline || !isConfirmed}
            onClick={() => setModalType('CASH_OUT')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              cursor: isSubmitting || isOffline || !isConfirmed ? 'not-allowed' : 'pointer',
              minHeight: '38px',
            }}
          >
            <IconCash size={16} />
            <span>- RETIRO</span>
          </button>

          <button
            type="button"
            className="ticket-ledger-control ticket-ledger-action ticket-ledger-action--primary"
            data-testid="open-close-shift-modal-button"
            disabled={isSubmitting || isOffline || !isConfirmed}
            onClick={() => setModalType('CLOSE')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              backgroundColor: 'var(--color-pulse-solid)',
              color: '#0f172a',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              boxShadow: 'var(--shadow-key)',
              cursor: isSubmitting || isOffline || !isConfirmed ? 'not-allowed' : 'pointer',
              minHeight: '38px',
              letterSpacing: '0.04em',
            }}
          >
            <span>CERRAR CAJA</span>
          </button>
        </div>
      </div>

      {!isConfirmed && (
        <div
          role="alert"
          data-testid="cash-unconfirmed-cache-warning"
          className="ticket-ledger-alert ticket-ledger-alert--warning"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-amber-soft)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-amber-border)',
            borderRadius: 'var(--radius-xs)',
            padding: '10px 14px',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
          }}
        >
          <IconAlert size={16} />
          <span>
            Turno sin confirmar con el servidor. Se muestra la última copia local conocida con fines
            informativos. Las operaciones de ingreso, retiro y cierre permanecerán bloqueadas hasta
            verificar el estado con el servidor.
          </span>
        </div>
      )}

      {isOffline && (
        <div
          role="alert"
          className="ticket-ledger-alert ticket-ledger-alert--warning"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-amber-soft)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-amber-border)',
            borderRadius: 'var(--radius-xs)',
            padding: '10px 14px',
            fontSize: 'var(--text-xs)',
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
          className="ticket-ledger-alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--color-pulse-soft)',
            color: 'var(--color-pulse-text)',
            border: '1px solid var(--color-pulse-border)',
            borderRadius: 'var(--radius-xs)',
            padding: '10px 14px',
            fontSize: 'var(--text-xs)',
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
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xs)',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              textTransform: 'uppercase',
            }}
          >
            Fondo Inicial
          </div>
          <div
            data-testid="kpi-opening-amount"
            className="ticket-ledger-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-lg)',
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
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xs)',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              textTransform: 'uppercase',
            }}
          >
            Ventas Efectivo ({summary.salesCount})
          </div>
          <div
            data-testid="kpi-cash-sales-amount"
            className="ticket-ledger-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-lg)',
              fontWeight: 900,
              marginTop: '4px',
              color: 'var(--color-pulse-text)',
            }}
          >
            + {Money.fromCents(summary.cashSalesAmountCents).format()}
          </div>
        </div>

        {/* Ingresos Manuales */}
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xs)',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              textTransform: 'uppercase',
            }}
          >
            Ingresos Manuales
          </div>
          <div
            data-testid="kpi-cash-in-amount"
            className="ticket-ledger-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-lg)',
              fontWeight: 900,
              marginTop: '4px',
              color: 'var(--color-pulse-solid)',
            }}
          >
            + {Money.fromCents(summary.cashInAmountCents).format()}
          </div>
        </div>

        {/* Retiros Manuales */}
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-xs)',
            padding: '12px 16px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              textTransform: 'uppercase',
            }}
          >
            Retiros Manuales
          </div>
          <div
            data-testid="kpi-cash-out-amount"
            className="ticket-ledger-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-lg)',
              fontWeight: 900,
              marginTop: '4px',
              color: 'var(--color-tomato-solid)',
            }}
          >
            - {Money.fromCents(summary.cashOutAmountCents).format()}
          </div>
        </div>

        {/* Saldo Esperado en Caja (Hero) */}
        <div
          style={{
            backgroundColor: 'var(--color-surface-sunken)',
            border: '2px solid var(--color-ink)',
            borderRadius: 'var(--radius-xs)',
            padding: '12px 16px',
            gridColumn: 'span 1',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              color: 'var(--color-ink)',
              textTransform: 'uppercase',
            }}
          >
            Saldo Esperado en Caja
          </div>
          <div
            data-testid="kpi-expected-amount"
            className="ticket-ledger-total ticket-ledger-amount"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-xl)',
              fontWeight: 900,
              marginTop: '4px',
              color: 'var(--color-ink)',
            }}
          >
            {Money.fromCents(summary.expectedAmountCents).format()}
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div
        className="ticket-ledger-surface"
        role="region"
        aria-label="Movimientos del turno"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--color-surface-sunken)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 800, margin: 0 }}>
            Movimientos del Turno ({shift.movements?.length ?? 0})
          </h2>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
            Ledger cronológico inmutable
          </span>
        </div>

        <div className="ticket-ledger-table-wrap" style={{ overflowX: 'auto' }}>
          <table
            data-testid="cash-movements-table"
            className="ticket-ledger-table"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--text-xs)',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  color: 'var(--color-ink-muted)',
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
                      color: 'var(--color-ink-muted)',
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
                    typeColor = 'var(--color-ink-muted)';
                    sign = '+';
                  } else if (m.type === 'SALE') {
                    typeLabel = 'VENTA';
                    typeColor = 'var(--color-pulse-text)';
                    sign = '+';
                  } else if (m.type === 'CASH_IN') {
                    typeLabel = 'INGRESO';
                    typeColor = 'var(--color-pulse-solid)';
                    sign = '+';
                  } else if (m.type === 'CASH_OUT') {
                    typeLabel = (m as typeof m & { purchaseId?: string | null }).purchaseId ? 'COMPRA' : 'RETIRO';
                    typeColor = 'var(--color-tomato-solid)';
                    sign = '-';
                  } else if (m.type === 'REFUND') {
                    typeLabel = 'DEVOLUCIÓN';
                    typeColor = 'var(--color-tomato-solid)';
                    sign = '-';
                  }

                  return (
                    <tr
                      key={m.id}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      <td
                        style={{ padding: '10px 14px', fontFamily: 'monospace, var(--font-mono)' }}
                      >
                        {timeFormatted}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          className="ticket-ledger-stamp"
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-xs)',
                            backgroundColor: 'var(--color-surface-sunken)',
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
          breakdown={{
            openingAmountCents: summary.openingAmountCents,
            cashSalesAmountCents: summary.cashSalesAmountCents,
            purchaseAmountCents,
            cashInAmountCents: summary.cashInAmountCents,
            cashOutAmountCents: summary.cashOutAmountCents - purchaseAmountCents,
            refundAmountCents: summary.refundAmountCents,
          }}
          isSubmitting={isSubmitting}
          onConfirmClose={onCloseShift}
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  );
};
