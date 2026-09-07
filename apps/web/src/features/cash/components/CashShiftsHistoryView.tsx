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
        <h2 style={{ fontSize: 'var(--text-lg, 18px)', fontWeight: 900, margin: 0 }}>
          Historial de Turnos de Caja
        </h2>
        <div style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-ink-muted, #666)' }}>
          Auditoría de turnos pasados, arqueos de efectivo y discrepancias operativas.
        </div>
      </div>

      {/* Filter Bar */}
      <form
        onSubmit={handleFilter}
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          backgroundColor: 'var(--color-surface, #fff)',
          border: '1px solid var(--color-border, #ddd)',
          borderRadius: 'var(--radius-xs, 4px)',
          padding: '12px 16px',
        }}
      >
        <div>
          <label
            htmlFor="history-from-date"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #666)',
              marginBottom: '2px',
            }}
          >
            DESDE
          </label>
          <input
            id="history-from-date"
            type="date"
            data-testid="shift-history-from-input"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--text-xs, 12px)',
              borderRadius: 'var(--radius-xs, 4px)',
              border: '1px solid var(--color-border, #ccc)',
              backgroundColor: 'var(--color-surface, #fff)',
              color: 'var(--color-ink)',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="history-to-date"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #666)',
              marginBottom: '2px',
            }}
          >
            HASTA
          </label>
          <input
            id="history-to-date"
            type="date"
            data-testid="shift-history-to-input"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--text-xs, 12px)',
              borderRadius: 'var(--radius-xs, 4px)',
              border: '1px solid var(--color-border, #ccc)',
              backgroundColor: 'var(--color-surface, #fff)',
              color: 'var(--color-ink)',
            }}
          />
        </div>

        <div>
          <label
            htmlFor="history-status-select"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs, 11px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #666)',
              marginBottom: '2px',
            }}
          >
            ESTADO
          </label>
          <select
            id="history-status-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'OPEN' | 'CLOSED' | '')}
            style={{
              padding: '6px 8px',
              fontSize: 'var(--text-xs, 12px)',
              borderRadius: 'var(--radius-xs, 4px)',
              border: '1px solid var(--color-border, #ccc)',
              backgroundColor: 'var(--color-surface, #fff)',
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
          data-testid="shift-history-filter-button"
          disabled={isLoading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 14px',
            fontSize: 'var(--text-xs, 12px)',
            fontWeight: 800,
            backgroundColor: 'var(--color-brand, #0066cc)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-xs, 4px)',
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
          style={{
            backgroundColor: 'rgba(220, 53, 69, 0.12)',
            color: 'var(--color-danger, #dc3545)',
            border: '1px solid var(--color-danger, #dc3545)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '10px 14px',
            fontSize: 'var(--text-xs, 12px)',
            fontWeight: 700,
          }}
        >
          {error}
        </div>
      )}

      {/* History Table */}
      <div
        style={{
          backgroundColor: 'var(--color-surface, #fff)',
          border: '1px solid var(--color-border, #ddd)',
          borderRadius: 'var(--radius-md, 8px)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table
            data-testid="shift-history-table"
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
                  backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.02))',
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
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
                    Cargando historial...
                  </td>
                </tr>
              ) : shifts.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
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
                      diffColor = 'var(--color-success, #28a745)';
                      diffLabel = '$ 0,00';
                    } else if (diff > 0) {
                      diffColor = '#0056b3';
                      diffLabel = `+ ${Money.fromCents(diff).format()}`;
                    } else {
                      diffColor = 'var(--color-danger, #dc3545)';
                      diffLabel = `- ${Money.fromCents(Math.abs(diff)).format()}`;
                    }
                  }

                  return (
                    <tr
                      key={s.id}
                      style={{ borderBottom: '1px solid var(--color-border, #f0f0f0)' }}
                    >
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
                          style={{
                            display: 'inline-block',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor:
                              s.status === 'OPEN'
                                ? 'rgba(40, 167, 69, 0.12)'
                                : 'rgba(108, 117, 125, 0.12)',
                            color:
                              s.status === 'OPEN' ? 'var(--color-success, #28a745)' : '#6c757d',
                            fontWeight: 800,
                          }}
                        >
                          {s.status === 'OPEN' ? 'ABIERTO' : 'CERRADO'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => onSelectShift(s.id)}
                          style={{
                            padding: '4px 8px',
                            fontSize: 'var(--text-xs, 11px)',
                            fontWeight: 800,
                            backgroundColor: 'transparent',
                            color: 'var(--color-brand, #0066cc)',
                            border: '1px solid var(--color-brand, #0066cc)',
                            borderRadius: 'var(--radius-xs, 4px)',
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
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.02))',
            borderTop: '1px solid var(--color-border, #eee)',
            fontSize: 'var(--text-xs, 12px)',
          }}
        >
          <div>
            Total: <strong>{total}</strong> turnos
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => handlePageChange(page - 1)}
              style={{
                padding: '4px 10px',
                fontSize: 'var(--text-xs, 12px)',
                fontWeight: 800,
                backgroundColor: 'var(--color-surface, #fff)',
                border: '1px solid var(--color-border, #ccc)',
                borderRadius: 'var(--radius-xs, 4px)',
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
              disabled={page >= totalPages || isLoading}
              onClick={() => handlePageChange(page + 1)}
              style={{
                padding: '4px 10px',
                fontSize: 'var(--text-xs, 12px)',
                fontWeight: 800,
                backgroundColor: 'var(--color-surface, #fff)',
                border: '1px solid var(--color-border, #ccc)',
                borderRadius: 'var(--radius-xs, 4px)',
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
