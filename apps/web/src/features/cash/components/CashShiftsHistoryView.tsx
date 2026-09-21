import React, { useState } from 'react';
import { Money } from '@pulso/domain';
import type { CashShiftResponse, QueryCashShifts } from '@pulso/contracts';
import { IconSearch } from '@pulso/icons';

interface CashShiftsHistoryViewProps {
  shifts: CashShiftResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  onFetch: (params: QueryCashShifts) => void;
  onSelectShift: (id: string) => void;
}

export const CashShiftsHistoryView: React.FC<CashShiftsHistoryViewProps> = ({
  shifts,
  total,
  page,
  limit,
  totalPages,
  isLoading,
  error,
  onFetch,
  onSelectShift,
}) => {
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'OPEN' | 'CLOSED' | ''>('');

  const handleFilter = (e: React.FormEvent) => {
    e.preventDefault();
    onFetch({
      page: 1,
      limit,
      from: fromDate || undefined,
      to: toDate || undefined,
      status: statusFilter ? statusFilter : undefined,
    });
  };

  const handlePageChange = (newPage: number) => {
    onFetch({
      page: newPage,
      limit,
      from: fromDate || undefined,
      to: toDate || undefined,
      status: statusFilter ? statusFilter : undefined,
    });
  };

  return (
    <div
      className="ticket-ledger-view ticket-ledger-oversight"
      role="region"
      aria-label="Historial de turnos de caja"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        padding: '16px',
        maxWidth: '1200px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 900, margin: 0 }}>
          Historial de Turnos de Caja
        </h2>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
          Auditoría de turnos pasados, arqueos de efectivo y discrepancias operativas.
        </div>
      </div>

      {/* Filter Bar */}
      <form
        className="ticket-ledger-filter ticket-ledger-surface"
        onSubmit={handleFilter}
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xs)',
          padding: '12px 16px',
        }}
      >
        <div>
          <label
            htmlFor="history-from-date"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              marginBottom: '2px',
            }}
          >
            DESDE
          </label>
          <input
            id="history-from-date"
            type="date"
            className="ticket-ledger-control"
            data-testid="shift-history-from-input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--text-xs)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="history-to-date"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              marginBottom: '2px',
            }}
          >
            HASTA
          </label>
          <input
            id="history-to-date"
            className="ticket-ledger-control"
            type="date"
            data-testid="shift-history-to-input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--text-xs)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="history-status-select"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              marginBottom: '2px',
            }}
          >
            ESTADO
          </label>
          <select
            id="history-status-select"
            className="ticket-ledger-control"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'OPEN' | 'CLOSED' | '')}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--text-xs)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              minHeight: '32px',
            }}
          >
            <option value="">Todos</option>
            <option value="OPEN">Abierto</option>
            <option value="CLOSED">Cerrado</option>
          </select>
        </div>

        <button
          type="submit"
          className="ticket-ledger-control ticket-ledger-action ticket-ledger-action--primary"
          data-testid="shift-history-filter-button"
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 14px',
            fontSize: 'var(--text-xs)',
            fontWeight: 800,
            backgroundColor: 'var(--color-pulse-solid)',
            color: 'var(--color-surface)',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            minHeight: '32px',
          }}
        >
          <IconSearch size={14} />
          <span>FILTRAR</span>
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="ticket-ledger-alert ticket-ledger-alert--error"
          style={{
            backgroundColor: 'var(--color-tomato-soft)',
            color: 'var(--color-tomato-solid)',
            border: '1px solid var(--color-tomato-solid)',
            borderRadius: 'var(--radius-xs)',
            padding: '10px 14px',
            fontSize: 'var(--text-xs)',
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      {/* History Table */}
      <div
        className="ticket-ledger-surface"
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div className="ticket-ledger-table-wrap" style={{ overflowX: 'auto' }}>
          <table
            data-testid="shift-history-table"
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
                  backgroundColor: 'var(--color-surface-sunken)',
                }}
              >
                <th style={{ padding: '10px 12px', fontWeight: 800 }}>APERTURA</th>
                <th style={{ padding: '10px 12px', fontWeight: 800 }}>CIERRE</th>
                <th style={{ padding: '10px 12px', fontWeight: 800 }}>OPERADOR</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>FONDO</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>
                  ESPERADO
                </th>
                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>
                  CONTADO
                </th>
                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'right' }}>
                  DIFERENCIA
                </th>
                <th style={{ padding: '10px 12px', fontWeight: 800 }}>ESTADO</th>
                <th style={{ padding: '10px 12px', fontWeight: 800, textAlign: 'center' }}>
                  ACCIÓN
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="ticket-ledger-empty"
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      color: 'var(--color-ink-muted)',
                    }}
                  >
                    Cargando historial...
                  </td>
                </tr>
              ) : shifts.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="ticket-ledger-empty"
                    style={{
                      padding: '32px',
                      textAlign: 'center',
                      color: 'var(--color-ink-muted)',
                    }}
                  >
                    No se encontraron turnos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                shifts.map((s) => {
                  const openDate = new Date(s.openedAtUtc);
                  const openStr = `${openDate.toLocaleDateString('es-AR')} ${openDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;

                  const closeDate = s.closedAtUtc ? new Date(s.closedAtUtc) : null;
                  const closeStr = closeDate
                    ? `${closeDate.toLocaleDateString('es-AR')} ${closeDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                    : '—';

                  const expected =
                    s.expectedAmountCents ?? s.summary?.expectedAmountCents ?? s.openingAmountCents;
                  const counted = s.countedAmountCents;
                  const diff = s.differenceAmountCents;

                  let diffColor = 'var(--color-ink)';
                  let diffLabel = '—';
                  if (diff != null) {
                    if (diff === 0) {
                      diffColor = 'var(--color-pulse-text)';
                      diffLabel = '$ 0,00';
                    } else if (diff > 0) {
                      diffColor = 'var(--color-pulse-text)';
                      diffLabel = `+ ${Money.fromCents(diff).format()}`;
                    } else {
                      diffColor = 'var(--color-tomato-solid)';
                      diffLabel = `- ${Money.fromCents(Math.abs(diff)).format()}`;
                    }
                  }

                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td
                        style={{ padding: '10px 12px', fontFamily: 'monospace, var(--font-mono)' }}
                      >
                        {openStr}
                      </td>
                      <td
                        style={{ padding: '10px 12px', fontFamily: 'monospace, var(--font-mono)' }}
                      >
                        {closeStr}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{s.openedByUser?.name || '—'}</td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontFamily: 'monospace, var(--font-mono)',
                        }}
                      >
                        {Money.fromCents(s.openingAmountCents).format()}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontFamily: 'monospace, var(--font-mono)',
                        }}
                      >
                        {Money.fromCents(expected).format()}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontFamily: 'monospace, var(--font-mono)',
                        }}
                      >
                        {counted != null ? Money.fromCents(counted).format() : '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontFamily: 'monospace, var(--font-mono)',
                          fontWeight: 800,
                          color: diffColor,
                        }}
                      >
                        {diffLabel}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          className={`ticket-ledger-stamp ${s.status === 'OPEN' ? 'ticket-ledger-stamp--success' : 'ticket-ledger-stamp--warning'}`}
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              s.status === 'OPEN'
                                ? 'var(--color-pulse-soft)'
                                : 'var(--color-surface-sunken)',
                            color:
                              s.status === 'OPEN'
                                ? 'var(--color-pulse-text)'
                                : 'var(--color-ink-muted)',
                            fontWeight: 800,
                          }}
                        >
                          {s.status === 'OPEN' ? 'ABIERTO' : 'CERRADO'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="ticket-ledger-control ticket-ledger-action"
                          onClick={() => onSelectShift(s.id)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 'var(--text-xs)',
                            fontWeight: 800,
                            backgroundColor: 'transparent',
                            color: 'var(--color-pulse-solid)',
                            border: '1px solid var(--color-pulse-solid)',
                            borderRadius: 'var(--radius-xs)',
                            cursor: 'pointer',
                          }}
                        >
                          DETALLE
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div
          className="ticket-ledger-pagination"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            backgroundColor: 'var(--color-surface-sunken)',
            borderTop: '1px solid var(--color-border)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <div>
            Total: <strong>{total}</strong> turnos
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              className="ticket-ledger-control"
              disabled={page <= 1 || isLoading}
              onClick={() => handlePageChange(page - 1)}
              style={{
                padding: '4px 10px',
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                cursor: page <= 1 || isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              Anterior
            </button>
            <span>
              Página <strong>{page}</strong> de <strong>{totalPages || 1}</strong>
            </span>
            <button
              type="button"
              className="ticket-ledger-control"
              disabled={page >= totalPages || isLoading}
              onClick={() => handlePageChange(page + 1)}
              style={{
                padding: '4px 10px',
                fontSize: 'var(--text-xs)',
                fontWeight: 800,
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                cursor: page >= totalPages || isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              Siguiente
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
