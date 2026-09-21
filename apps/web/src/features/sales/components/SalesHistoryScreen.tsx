import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useSalesStore } from '../store/sales.store';
import { useOptionalAuth } from '../../auth/AuthContext';
import { Money } from '@pulso/domain';
import { IconSearch, IconClose, IconHistory, IconAlert } from '@pulso/icons';
import { salesApi } from '../services/sales-api';
import { ApiError } from '../../../services/api-client';
import { SaleAdjustmentModal } from './SaleAdjustmentModal';

const createAdjustmentIdempotencyKey = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const SalesHistoryScreen: React.FC = () => {
  const auth = useOptionalAuth();
  const session = auth?.session ?? null;

  const {
    salesHistory,
    localSalesHistory,
    salesTotal,
    salesPage,
    salesLimit,
    salesTotalPages,
    isSalesHistoryLoading,
    salesHistoryError,
    selectedSaleDetail,
    loadSalesHistory,
    loadSaleDetail,
    closeSaleDetail,
    retryOfflineSale,
  } = useSalesStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [adjustmentMode, setAdjustmentMode] = useState<'RETURN' | 'VOID' | null>(null);
  const [adjustmentSubmitting, setAdjustmentSubmitting] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<string | null>(null);
  const saleDetailCloseRef = useRef<HTMLButtonElement>(null);
  const canAdjust = session?.role === 'OWNER' || session?.role === 'MANAGER';
  const adjustmentsEnabled = import.meta.env.VITE_SALES_ADJUSTMENTS_ENABLED !== 'false';

  const handleFetch = useCallback(
    (page = 1) => {
      if (!session?.tenant?.id || !session?.location?.id) return;
      loadSalesHistory({
        tenantId: session.tenant.id,
        locationId: session.location.id,
        page,
        limit: salesLimit,
        search: searchTerm.trim() || undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
    },
    [
      session?.tenant?.id,
      session?.location?.id,
      salesLimit,
      searchTerm,
      fromDate,
      toDate,
      loadSalesHistory,
    ]
  );

  const tenantId = session?.tenant?.id;
  const locationId = session?.location?.id;

  useEffect(() => {
    if (!tenantId || !locationId) return;
    loadSalesHistory({
      tenantId,
      locationId,
      page: 1,
      limit: salesLimit,
    });
  }, [tenantId, locationId, salesLimit, loadSalesHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedSaleDetail && !adjustmentMode) {
        closeSaleDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedSaleDetail, adjustmentMode, closeSaleDetail]);

  useEffect(() => {
    if (!selectedSaleDetail || adjustmentMode) return;
    saleDetailCloseRef.current?.focus();
  }, [selectedSaleDetail, adjustmentMode]);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const translateTenderType = (type: string) => {
    switch (type) {
      case 'CASH':
        return 'Efectivo';
      case 'DEBIT':
        return 'Débito';
      case 'CREDIT':
        return 'Crédito';
      case 'TRANSFER':
        return 'Transferencia';
      default:
        return 'Otro';
    }
  };

  const submitAdjustment = async (
    reason: string,
    items: Array<{ saleItemId: string; quantity: number }>
  ) => {
    if (!selectedSaleDetail || !adjustmentMode) return;
    setAdjustmentSubmitting(true);
    setAdjustmentError(null);
    try {
      const idempotencyKey = createAdjustmentIdempotencyKey();
      const result =
        adjustmentMode === 'RETURN'
          ? await salesApi.returnSale(selectedSaleDetail.id, { idempotencyKey, reason, items })
          : await salesApi.voidSale(selectedSaleDetail.id, { idempotencyKey, reason });
      setAdjustmentMode(null);
      setAdjustmentSubmitting(false);
      useSalesStore.setState({ selectedSaleDetail: result.sale });
      handleFetch(salesPage);
    } catch (error) {
      const details =
        error instanceof ApiError && error.details && typeof error.details === 'object'
          ? (error.details as { code?: string })
          : {};
      const messages: Record<string, string> = {
        SHIFT_REQUIRED: 'No hay un turno de caja abierto para reintegrar el efectivo.',
        RETURN_QUANTITY_EXCEEDED: 'La cantidad supera lo que todavía puede devolverse.',
        VOID_AFTER_RETURN: 'No se puede anular una venta que ya tiene devoluciones.',
        SALE_NOT_COMPLETED: 'La venta ya no está disponible para ajustes.',
        IDEMPOTENCY_CONFLICT: 'La operación ya fue enviada con otra información.',
      };
      setAdjustmentError(
        messages[details.code ?? ''] ??
          (error instanceof Error ? error.message : 'No se pudo completar el ajuste.')
      );
      setAdjustmentSubmitting(false);
    }
  };

  return (
    <div
      className="ticket-ledger-view ticket-ledger-oversight"
      role="region"
      aria-label="Historial de ventas"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '16px 20px',
        boxSizing: 'border-box',
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
        fontFamily: 'var(--font-sans)',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <IconHistory size={24} />
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--text-xl)',
              fontWeight: 900,
              letterSpacing: '0.5px',
            }}
          >
            HISTORIAL DE VENTAS
          </h1>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              backgroundColor: 'var(--color-surface-sunken)',
              padding: '2px 8px',
              borderRadius: 'var(--radius-xs)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {salesTotal} {salesTotal === 1 ? 'venta' : 'ventas'}
          </span>
        </div>

        {/* Filters bar */}
        <form
          className="ticket-ledger-filter"
          onSubmit={(e) => {
            e.preventDefault();
            handleFetch(1);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="Buscar comprobante, producto..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ticket-ledger-control"
              aria-label="Buscar ventas"
              style={{
                height: '32px',
                padding: '0 8px 0 28px',
                fontSize: 'var(--text-xs)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                width: '210px',
              }}
            />
            <span
              style={{
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                opacity: 0.6,
                display: 'flex',
              }}
            >
              <IconSearch size={14} />
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: 'var(--text-xs)', opacity: 0.8 }}>Desde:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="ticket-ledger-control"
              aria-label="Fecha desde"
              style={{
                height: '32px',
                padding: '0 6px',
                fontSize: 'var(--text-xs)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <label style={{ fontSize: 'var(--text-xs)', opacity: 0.8 }}>Hasta:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="ticket-ledger-control"
              aria-label="Fecha hasta"
              style={{
                height: '32px',
                padding: '0 6px',
                fontSize: 'var(--text-xs)',
                backgroundColor: 'var(--color-surface)',
                color: 'var(--color-ink)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
              }}
            />
          </div>

          <button
            type="submit"
            className="ticket-ledger-control ticket-ledger-action ticket-ledger-action--primary"
            style={{
              height: '32px',
              padding: '0 12px',
              backgroundColor: 'var(--color-ink)',
              color: 'var(--color-surface)',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              fontSize: 'var(--text-xs)',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            FILTRAR
          </button>

          {(searchTerm || fromDate || toDate) && (
            <button
              type="button"
              className="ticket-ledger-control"
              onClick={() => {
                setSearchTerm('');
                setFromDate('');
                setToDate('');
                if (session?.tenant?.id && session?.location?.id) {
                  loadSalesHistory({
                    tenantId: session.tenant.id,
                    locationId: session.location.id,
                    page: 1,
                    limit: salesLimit,
                  });
                }
              }}
              style={{
                height: '32px',
                padding: '0 8px',
                backgroundColor: 'transparent',
                color: 'var(--color-ink-muted)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
              }}
            >
              LIMPIAR
            </button>
          )}
        </form>
      </div>

      {/* Error message */}
      {salesHistoryError && (
        <div
          className="ticket-ledger-alert ticket-ledger-alert--error"
          style={{
            backgroundColor: 'var(--color-tomato-soft)',
            border: '1px solid var(--color-tomato-border)',
            color: 'var(--color-ink)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-xs)',
            marginBottom: '12px',
            fontSize: 'var(--text-xs)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <IconAlert size={16} />
          <span>{salesHistoryError}</span>
        </div>
      )}

      {/* Dedicated Section: Operaciones locales pendientes / fallidas */}
      {localSalesHistory.length > 0 && (
        <section
          aria-label="Operaciones locales pendientes / fallidas"
          style={{
            marginBottom: '16px',
            border: '1px solid var(--color-amber-border)',
            borderRadius: 'var(--radius-xs)',
            backgroundColor: 'var(--color-surface-sunken)',
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <IconAlert size={16} />
              <h2
                style={{
                  margin: 0,
                  fontSize: 'var(--text-xs)',
                  fontWeight: 900,
                  letterSpacing: '0.5px',
                  textTransform: 'uppercase',
                }}
              >
                Operaciones locales pendientes / fallidas
              </h2>
              <span
                style={{
                  fontSize: '11px',
                  backgroundColor: 'var(--color-amber-soft)',
                  color: 'var(--color-ink)',
                  border: '1px solid var(--color-amber-border)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-xs)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700,
                }}
              >
                {localSalesHistory.length}
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                color: 'var(--color-ink-muted)',
              }}
            >
              En cola local para sincronización
            </span>
          </div>

          <div
            style={{
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: 'var(--color-surface)',
              overflow: 'auto',
            }}
          >
            <table
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
                    backgroundColor: 'var(--color-surface)',
                    borderBottom: '1px solid var(--color-border)',
                    fontWeight: 800,
                    color: 'var(--color-ink-muted)',
                  }}
                >
                  <th style={{ padding: '8px 10px' }}>FECHA / HORA</th>
                  <th style={{ padding: '8px 10px' }}>ID LOCAL</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>ITEMS</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right' }}>TOTAL</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>ESTADO</th>
                  <th style={{ padding: '8px 10px' }}>ERROR / CAUSA</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center' }}>ACCIONES</th>
                </tr>
              </thead>
              <tbody>
                {localSalesHistory.map((sale) => {
                  const isLocalFailed = sale.status === 'FAILED';
                  const itemsCount =
                    sale.items?.reduce((acc, it) => acc + parseFloat(it.quantity || '1'), 0) ?? 0;

                  return (
                    <tr
                      key={sale.id}
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        backgroundColor: isLocalFailed
                          ? 'var(--color-tomato-soft)'
                          : 'var(--color-amber-soft)',
                      }}
                    >
                      <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                        {formatDate(sale.createdAtUtc)}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                        }}
                      >
                        {sale.id}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                        {itemsCount}
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 800,
                        }}
                      >
                        {Money.fromCents(sale.totalCents).format()}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-xs)',
                            fontWeight: 800,
                            fontSize: '10px',
                            letterSpacing: '0.4px',
                            backgroundColor: isLocalFailed
                              ? 'var(--color-tomato-soft)'
                              : 'var(--color-amber-soft)',
                            color: isLocalFailed ? 'var(--color-tomato-solid)' : 'var(--color-ink)',
                            border: `1px solid ${
                              isLocalFailed
                                ? 'var(--color-tomato-border)'
                                : 'var(--color-amber-border)'
                            }`,
                          }}
                          title={isLocalFailed && sale.lastError ? sale.lastError : undefined}
                        >
                          {isLocalFailed ? 'FALLIDA LOCAL' : 'PENDIENTE LOCAL'}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          color: isLocalFailed
                            ? 'var(--color-tomato-solid)'
                            : 'var(--color-ink-muted)',
                          fontSize: '11px',
                          maxWidth: '220px',
                        }}
                      >
                        {sale.lastError ? (
                          <span title={sale.lastError}>{sale.lastError}</span>
                        ) : (
                          <span style={{ fontStyle: 'italic', opacity: 0.6 }}>
                            Pendiente de envío
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                          }}
                        >
                          {isLocalFailed && session?.tenant?.id && session?.location?.id && (
                            <button
                              type="button"
                              className="ticket-ledger-control ticket-ledger-action"
                              onClick={() =>
                                retryOfflineSale(
                                  {
                                    tenantId: session.tenant.id,
                                    locationId: session.location.id,
                                  },
                                  sale.idempotencyKey
                                )
                              }
                              aria-label={`Reintentar sincronización de venta ${sale.id}`}
                              style={{
                                height: '26px',
                                padding: '0 8px',
                                fontSize: 'var(--text-xs)',
                                backgroundColor: 'var(--color-tomato-soft)',
                                color: 'var(--color-tomato-solid)',
                                border: '1px solid var(--color-tomato-border)',
                                borderRadius: 'var(--radius-xs)',
                                cursor: 'pointer',
                                fontWeight: 800,
                              }}
                            >
                              REINTENTAR
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => loadSaleDetail(sale.id)}
                            aria-label={`Ver detalle de venta ${sale.id}`}
                            style={{
                              height: '26px',
                              padding: '0 8px',
                              fontSize: 'var(--text-xs)',
                              backgroundColor: 'var(--color-surface)',
                              color: 'var(--color-ink)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-xs)',
                              cursor: 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            DETALLE
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Table Container */}
      <div
        className="ticket-ledger-surface ticket-ledger-table-wrap"
        style={{
          flex: 1,
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xs)',
          backgroundColor: 'var(--color-surface)',
          overflow: 'auto',
        }}
      >
        <table
          className="ticket-ledger-table"
          data-testid="sales-history-table"
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
                backgroundColor: 'var(--color-surface-sunken)',
                borderBottom: '2px solid var(--color-border)',
                fontWeight: 800,
                color: 'var(--color-ink-muted)',
              }}
            >
              <th style={{ padding: '10px 12px' }}>FECHA / HORA</th>
              <th style={{ padding: '10px 12px' }}>COMPROBANTE</th>
              <th style={{ padding: '10px 12px' }}>OPERADOR</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>ITEMS</th>
              <th style={{ padding: '10px 12px' }}>PAGO</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>TOTAL</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>ESTADO</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            {isSalesHistoryLoading ? (
              <tr>
                <td colSpan={8} style={{ padding: '32px', textAlign: 'center' }}>
                  Cargando historial de ventas...
                </td>
              </tr>
            ) : salesHistory.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  style={{
                    padding: '36px',
                    textAlign: 'center',
                    color: 'var(--color-ink-muted)',
                  }}
                >
                  No se encontraron ventas para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              salesHistory.map((sale) => {
                const isLocalPending = sale.status === 'PENDING';
                const isLocalFailed = sale.status === 'FAILED';
                const itemsCount =
                  sale.items?.reduce((acc, it) => acc + parseFloat(it.quantity || '1'), 0) ?? 0;
                const tendersSummary =
                  sale.tenders?.map((t) => translateTenderType(t.type)).join(', ') || 'Efectivo';

                return (
                  <tr
                    key={sale.id}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: isLocalFailed
                        ? 'var(--color-tomato-soft)'
                        : isLocalPending
                          ? 'var(--color-amber-soft)'
                          : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {formatDate(sale.createdAtUtc)}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 700,
                      }}
                    >
                      {sale.id}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{sale.user?.name || 'Cajero'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>
                      {itemsCount}
                    </td>
                    <td style={{ padding: '10px 12px' }}>{tendersSummary}</td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                      }}
                    >
                      {Money.fromCents(sale.totalCents).format()}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-xs)',
                          fontWeight: 800,
                          fontSize: '10px',
                          letterSpacing: '0.4px',
                          backgroundColor: isLocalFailed
                            ? 'var(--color-tomato-soft)'
                            : isLocalPending
                              ? 'var(--color-amber-soft)'
                              : 'var(--color-pulse-soft)',
                          color: isLocalFailed
                            ? 'var(--color-tomato-text)'
                            : isLocalPending
                              ? 'var(--color-ink)'
                              : 'var(--color-pulse-text)',
                          border: `1px solid ${
                            isLocalFailed
                              ? 'var(--color-tomato-border)'
                              : isLocalPending
                                ? 'var(--color-amber-border)'
                                : 'var(--color-pulse-border)'
                          }`,
                        }}
                        title={isLocalFailed && sale.lastError ? sale.lastError : undefined}
                      >
                        {isLocalFailed
                          ? 'FALLIDA LOCAL'
                          : isLocalPending
                            ? 'PENDIENTE LOCAL'
                            : 'COMPLETADA'}
                      </span>
                      {isLocalFailed && sale.lastError && (
                        <div
                          style={{
                            fontSize: '9px',
                            color: 'var(--color-tomato-text)',
                            marginTop: '2px',
                            maxWidth: '120px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={sale.lastError}
                        >
                          {sale.lastError}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                        }}
                      >
                        {isLocalFailed && session?.tenant?.id && session?.location?.id && (
                          <button
                            type="button"
                            className="ticket-ledger-control ticket-ledger-action"
                            onClick={() =>
                              retryOfflineSale(
                                {
                                  tenantId: session.tenant.id,
                                  locationId: session.location.id,
                                },
                                sale.idempotencyKey
                              )
                            }
                            aria-label={`Reintentar sincronización de venta ${sale.id}`}
                            style={{
                              height: '26px',
                              padding: '0 8px',
                              fontSize: 'var(--text-xs)',
                              backgroundColor: 'var(--color-tomato-soft)',
                              color: 'var(--color-tomato-text)',
                              border: '1px solid var(--color-tomato-border)',
                              borderRadius: 'var(--radius-xs)',
                              cursor: 'pointer',
                              fontWeight: 800,
                            }}
                          >
                            REINTENTAR
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => loadSaleDetail(sale.id)}
                          aria-label={`Ver detalle de venta ${sale.id}`}
                          style={{
                            height: '26px',
                            padding: '0 8px',
                            fontSize: 'var(--text-xs)',
                            backgroundColor: 'var(--color-surface)',
                            color: 'var(--color-ink)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-xs)',
                            cursor: 'pointer',
                            fontWeight: 700,
                          }}
                        >
                          DETALLE
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div
        className="ticket-ledger-pagination"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '12px',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-ink-muted)',
        }}
      >
        <span>
          Página {salesPage} de {Math.max(1, salesTotalPages)} (Total: {salesTotal} ventas)
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            className="ticket-ledger-control"
            disabled={salesPage <= 1 || isSalesHistoryLoading}
            onClick={() => handleFetch(salesPage - 1)}
            style={{
              height: '30px',
              padding: '0 12px',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              cursor: salesPage <= 1 ? 'not-allowed' : 'pointer',
              opacity: salesPage <= 1 ? 0.5 : 1,
              fontWeight: 700,
            }}
          >
            ANTERIOR
          </button>
          <button
            type="button"
            className="ticket-ledger-control"
            disabled={salesPage >= salesTotalPages || isSalesHistoryLoading}
            onClick={() => handleFetch(salesPage + 1)}
            style={{
              height: '30px',
              padding: '0 12px',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              cursor: salesPage >= salesTotalPages ? 'not-allowed' : 'pointer',
              opacity: salesPage >= salesTotalPages ? 0.5 : 1,
              fontWeight: 700,
            }}
          >
            SIGUIENTE
          </button>
        </div>
      </div>

      {/* Sale Detail Modal */}
      {selectedSaleDetail && (
        <div
          className="sale-detail-modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSaleDetail();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'var(--color-overlay)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 120,
            padding: '16px',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sale-detail-title"
            className="ticket-ledger-modal ticket-ledger-surface sale-detail-modal__content"
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '2px solid var(--color-ink)',
              borderRadius: 'var(--radius-xs)',
              padding: '24px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: 'var(--shadow-modal)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            <div role="region" aria-label="Comprobante de venta">
              {/* Modal Header */}
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
                  <h2 id="sale-detail-title" style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 900 }}>
                    DETALLE DE VENTA
                  </h2>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-ink-muted)',
                      fontFamily: 'var(--font-mono)',
                      marginTop: '2px',
                    }}
                  >
                    {selectedSaleDetail.id}
                  </div>
                </div>
                <button
                  type="button"
                  ref={saleDetailCloseRef}
                  className="pulso-button pulso-button--ghost sale-detail-modal__close"
                  onClick={closeSaleDetail}
                  aria-label="Cerrar detalle"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-ink)',
                    display: 'flex',
                  }}
                >
                  <IconClose size={20} />
                </button>
              </div>

              {/* Context meta */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '10px',
                  backgroundColor: 'var(--color-surface-sunken)',
                  padding: '12px',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: 'var(--text-xs)',
                  marginBottom: '16px',
                }}
              >
                <div>
                  <span style={{ color: 'var(--color-ink-muted)' }}>Fecha:</span>{' '}
                  <strong>{formatDate(selectedSaleDetail.createdAtUtc)}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-ink-muted)' }}>Operador:</span>{' '}
                  <strong>{selectedSaleDetail.user?.name || 'Cajero'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-ink-muted)' }}>Estado:</span>{' '}
                  <strong
                    style={{
                      color:
                        selectedSaleDetail.status === 'FAILED'
                          ? 'var(--color-tomato-solid)'
                          : selectedSaleDetail.status === 'PENDING'
                            ? 'var(--color-amber-solid)'
                            : 'var(--color-pulse-text)',
                    }}
                  >
                    {selectedSaleDetail.status === 'FAILED'
                      ? 'FALLIDA LOCAL'
                      : selectedSaleDetail.status === 'PENDING'
                        ? 'PENDIENTE LOCAL'
                        : 'COMPLETADA'}
                  </strong>
                </div>
                <div>
                  <span style={{ color: 'var(--color-ink-muted)' }}>Idempotencia:</span>{' '}
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {selectedSaleDetail.idempotencyKey.slice(0, 13)}...
                  </span>
                </div>
              </div>

              {/* Failed Error Banner */}
              {selectedSaleDetail.status === 'FAILED' && (
                <div
                  style={{
                    backgroundColor: 'var(--color-tomato-soft)',
                    border: '1px solid var(--color-tomato-border)',
                    color: 'var(--color-tomato-solid)',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-xs)',
                    marginBottom: '16px',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 800,
                      marginBottom: '4px',
                    }}
                  >
                    <IconAlert size={16} />
                    <span>OPERACIÓN LOCAL FALLIDA</span>
                  </div>
                  <div>
                    <strong>Causa del rechazo:</strong>{' '}
                    {selectedSaleDetail.lastError ||
                      'Error durante la sincronización con el servidor.'}
                  </div>
                </div>
              )}

              {/* Items table */}
              <h3 style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
                Productos Vendidos
              </h3>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: 'var(--text-xs)',
                  marginBottom: '16px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      backgroundColor: 'var(--color-surface-sunken)',
                      borderBottom: '1px solid var(--color-border)',
                    }}
                  >
                    <th style={{ padding: '6px 8px', textAlign: 'left' }}>Producto</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Código</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Cant.</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Precio Unit.</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSaleDetail.items?.map((it) => (
                    <tr key={it.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{it.name}</td>
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'center',
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-ink-muted)',
                        }}
                      >
                        {it.barcode || '-'}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: 700 }}>
                        {it.quantity}
                      </td>
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {Money.fromCents(it.unitPriceCents).format()}
                      </td>
                      <td
                        style={{
                          padding: '6px 8px',
                          textAlign: 'right',
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                        }}
                      >
                        {Money.fromCents(it.totalPriceCents).format()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Tenders breakdown */}
              <h3 style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)', fontWeight: 800 }}>
                Medios de Pago
              </h3>
              <div
                style={{
                  backgroundColor: 'var(--color-ticket-edge)',
                  border: '1px dashed var(--color-ink)',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-xs)',
                  fontSize: 'var(--text-xs)',
                  marginBottom: '20px',
                }}
              >
                {selectedSaleDetail.tenders?.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                    }}
                  >
                    <span>
                      <strong>{translateTenderType(t.type).toUpperCase()}</strong>
                      {t.reference ? ` (${t.reference})` : ''}:
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                      {Money.fromCents(t.amountCents).format()}
                    </span>
                  </div>
                ))}
                {selectedSaleDetail.tenders?.[0]?.receivedAmountCents && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
                    <span>Recibido:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {Money.fromCents(selectedSaleDetail.tenders[0].receivedAmountCents).format()}
                    </span>
                  </div>
                )}
                {selectedSaleDetail.tenders?.[0]?.changeAmountCents && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.8 }}>
                    <span>Vuelto entregado:</span>
                    <span style={{ fontFamily: 'var(--font-mono)' }}>
                      {Money.fromCents(selectedSaleDetail.tenders[0].changeAmountCents).format()}
                    </span>
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: '6px',
                    marginTop: '6px',
                    fontWeight: 900,
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <span>TOTAL VENTA:</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    {Money.fromCents(selectedSaleDetail.totalCents).format()}
                  </span>
                </div>
              </div>

              {selectedSaleDetail.adjustments && selectedSaleDetail.adjustments.length > 0 && (
                <section
                  aria-label="Historial de ajustes"
                  style={{
                    marginBottom: 16,
                    borderTop: '1px solid var(--color-border)',
                    paddingTop: 14,
                  }}
                >
                  <h3 style={{ margin: '0 0 8px', fontSize: 'var(--text-sm)' }}>
                    Historial de ajustes
                  </h3>
                  {selectedSaleDetail.adjustments.map((adjustment) => (
                    <article
                      key={adjustment.id}
                      style={{
                        fontSize: 12,
                        padding: '10px 12px',
                        background: 'var(--color-surface-sunken)',
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong>
                          {adjustment.type === 'VOID' ? 'ANULACIÓN' : 'DEVOLUCIÓN'} ·{' '}
                          {adjustment.status === 'PENDING' ? 'PENDIENTE' : 'COMPLETADA'}
                        </strong>
                        <time dateTime={adjustment.createdAt}>
                          {formatDate(adjustment.createdAt)}
                        </time>
                      </div>
                      <div>
                        {Money.fromCents(adjustment.totalCents).format()} ·{' '}
                        {translateTenderType(adjustment.refundTender)} ·{' '}
                        {adjustment.refundStatus === 'PENDING'
                          ? 'Pendiente manual'
                          : 'Reintegro completado'}
                      </div>
                      <div>
                        {adjustment.reason} · {adjustment.actor.name} ({adjustment.actor.email})
                      </div>
                      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                        {adjustment.items.map((item) => {
                          const saleItem = selectedSaleDetail.items?.find(
                            (line) => line.id === item.saleItemId
                          );
                          return (
                            <li key={item.id}>
                              {saleItem?.name ?? item.productId}: {item.quantity} ×{' '}
                              {Money.fromCents(item.unitPriceCents).format()}
                            </li>
                          );
                        })}
                      </ul>
                    </article>
                  ))}
                </section>
              )}

              {canAdjust &&
                adjustmentsEnabled &&
                selectedSaleDetail.status === 'COMPLETED' &&
                (() => {
                  const returnedByItem = new Map<string, number>();
                  for (const adjustment of selectedSaleDetail.adjustments ?? []) {
                    for (const item of adjustment.items) {
                      returnedByItem.set(
                        item.saleItemId,
                        (returnedByItem.get(item.saleItemId) ?? 0) + Number(item.quantity)
                      );
                    }
                  }
                  const hasRemainingItems =
                    selectedSaleDetail.items?.some(
                      (item) => Number(item.quantity) - (returnedByItem.get(item.id) ?? 0) > 0
                    ) ?? false;
                  const hasPriorAdjustment = (selectedSaleDetail.adjustments?.length ?? 0) > 0;
                  return (
                    <section
                      aria-label="Acciones de devolución y anulación"
                      style={{ marginBottom: 16 }}
                    >
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          className="pulso-button pulso-button--secondary pulso-button--sm"
                          onClick={() => {
                            setAdjustmentError(null);
                            setAdjustmentMode('RETURN');
                          }}
                          disabled={!hasRemainingItems}
                        >
                          Devolver artículos
                        </button>
                        {!hasPriorAdjustment && (
                          <button
                          type="button"
                          className="pulso-button pulso-button--danger pulso-button--sm"
                            onClick={() => {
                              setAdjustmentError(null);
                              setAdjustmentMode('VOID');
                            }}
                          >
                            Anular venta
                          </button>
                        )}
                      </div>
                    </section>
                  );
                })()}

              {/* Retry action for FAILED sale */}
              {selectedSaleDetail.status === 'FAILED' &&
                session?.tenant?.id &&
                session?.location?.id && (
                  <button
                    type="button"
                    className="ticket-ledger-control ticket-ledger-action ticket-ledger-action--primary"
                    onClick={async () => {
                      await retryOfflineSale(
                        { tenantId: session.tenant.id, locationId: session.location.id },
                        selectedSaleDetail.idempotencyKey
                      );
                      closeSaleDetail();
                    }}
                    aria-label={`Reintentar sincronización de comprobante ${selectedSaleDetail.id}`}
                    style={{
                      width: '100%',
                      height: '40px',
                      backgroundColor: 'var(--color-tomato-solid)',
                      color: 'var(--color-surface)',
                      border: 'none',
                      borderRadius: 'var(--radius-xs)',
                      fontWeight: 800,
                      fontSize: 'var(--text-xs)',
                      cursor: 'pointer',
                      marginBottom: '8px',
                      letterSpacing: '0.5px',
                    }}
                  >
                    REINTENTAR SINCRONIZACIÓN
                  </button>
                )}

              {/* Close action */}
              <button
                type="button"
                className="pulso-button pulso-button--secondary sale-detail-modal__close-action"
                onClick={closeSaleDetail}
                style={{
                  width: '100%',
                  height: '40px',
                  backgroundColor: 'var(--color-ink)',
                  color: 'var(--color-surface)',
                  border: 'none',
                  borderRadius: 'var(--radius-xs)',
                  fontWeight: 800,
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                CERRAR (ESC)
              </button>
            </div>
          </div>
        </div>
      )}
      {selectedSaleDetail && adjustmentMode && (
        <SaleAdjustmentModal
          sale={selectedSaleDetail}
          mode={adjustmentMode}
          isSubmitting={adjustmentSubmitting}
          error={adjustmentError}
          onClose={() => {
            if (!adjustmentSubmitting) {
              setAdjustmentMode(null);
              setAdjustmentError(null);
            }
          }}
          onSubmit={submitAdjustment}
        />
      )}
    </div>
  );
};
