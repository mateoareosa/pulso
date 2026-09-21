import React, { useState } from 'react';
import { usePurchasesStore } from '../store/purchases.store';
import { PurchaseDetailModal } from './PurchaseDetailModal';
import { Money } from '@pulso/domain';
import type { PurchaseResponse, PurchaseStatus, PurchaseDetailResponse } from '@pulso/contracts';

interface PurchasesListViewProps {
  context: { tenantId: string; locationId: string };
  isOffline: boolean;
  onOpenCreate: () => void;
  onResume: (draft: PurchaseDetailResponse) => void;
}

export const PurchasesListView: React.FC<PurchasesListViewProps> = ({
  context,
  isOffline,
  onOpenCreate,
  onResume,
}) => {
  const {
    purchases,
    purchasesTotal,
    purchasesPage,
    purchasesTotalPages,
    isLoadingPurchases,
    purchasesError,
    suppliers,
    selectedPurchase,
    loadPurchases,
    loadPurchaseDetail,
    closePurchaseDetail,
  } = usePurchasesStore();

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [supplierFilter, setSupplierFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const handleFilterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadPurchases(context, {
      status: (statusFilter as PurchaseStatus) || undefined,
      supplierId: supplierFilter || undefined,
      search: search.trim() || undefined,
      page: 1,
    });
  };

  const handlePageChange = (newPage: number) => {
    loadPurchases(context, {
      status: (statusFilter as PurchaseStatus) || undefined,
      supplierId: supplierFilter || undefined,
      search: search.trim() || undefined,
      page: newPage,
    });
  };

  const getStatusBadge = (status: PurchaseStatus) => {
    switch (status) {
      case 'RECEIVED':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill, 12px)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              backgroundColor: 'var(--color-success-soft, #dcfce7)',
              color: 'var(--color-success-strong, #15803d)',
            }}
          >
            RECIBIDA
          </span>
        );
      case 'CANCELLED':
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill, 12px)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              backgroundColor: 'var(--color-danger-soft, #fee2e2)',
              color: 'var(--color-danger-solid)',
            }}
          >
            CANCELADA
          </span>
        );
      case 'DRAFT':
      default:
        return (
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 'var(--radius-pill, 12px)',
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              backgroundColor: 'var(--color-warning-soft, #fef3c7)',
              color: 'var(--color-warning, #b45309)',
            }}
          >
            BORRADOR
          </span>
        );
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Search & Filters */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px',
          backgroundColor: 'var(--color-surface-sunken)',
          border: '2px solid var(--color-border)',
          borderRadius: 'var(--radius-xs)',
        }}
      >
        <form
          onSubmit={handleFilterSubmit}
          style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', flex: '1 1 auto' }}
        >
          <input className="pulso-input"
            type="text"
            data-testid="purchase-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por comprobante o notas..."
            disabled={isOffline}
            style={{
              padding: '8px 10px 8px 12px',
              borderRadius: 'var(--radius-xs)',
              border: '2px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              minWidth: '220px',
              fontSize: 'var(--text-sm)',
              boxSizing: 'border-box',
            }}
          />

          <select className="pulso-select"
            data-testid="purchase-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={isOffline}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-xs)',
              border: '2px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <option value="">Todos los estados</option>
            <option value="DRAFT">Borradores</option>
            <option value="RECEIVED">Recibidas</option>
            <option value="CANCELLED">Canceladas</option>
          </select>

          <select className="pulso-select"
            data-testid="purchase-supplier-filter"
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            disabled={isOffline}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-xs)',
              border: '2px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <option value="">Todos los proveedores</option>
            {suppliers.map((sup) => (
              <option key={sup.id} value={sup.id}>
                {sup.name}
              </option>
            ))}
          </select>

          <button className="pulso-button pulso-button--md"
            type="submit"
            data-testid="purchase-filter-submit"
            disabled={isOffline}
            style={{
              padding: '8px 14px',
              fontWeight: 700,
              cursor: isOffline ? 'not-allowed' : 'pointer',
              backgroundColor: 'var(--color-pulse-solid)',
              color: '#0f172a',
              border: 'none',
              borderRadius: 'var(--radius-xs)',
              minHeight: '38px',
              boxShadow: 'var(--shadow-key)',
            }}
          >
            Filtrar
          </button>
        </form>

        <button className="pulso-button pulso-button--md"
          type="button"
          data-testid="start-new-purchase-btn"
          onClick={onOpenCreate}
          disabled={isOffline}
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--color-pulse-solid)',
            color: '#0f172a',
            border: 'none',
            borderRadius: 'var(--radius-xs)',
            fontWeight: 800,
            cursor: isOffline ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--radius-sm, 6px)',
            minHeight: '38px',
            boxShadow: 'var(--shadow-key)',
          }}
        >
          + REGISTRAR COMPRA
        </button>
      </div>

      {purchasesError && (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            backgroundColor: 'var(--color-danger-soft, #fee2e2)',
            color: 'var(--color-danger-solid)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--text-sm)',
          }}
        >
          {purchasesError}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: '2px solid var(--color-border)',
          borderRadius: 'var(--radius-xs)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--color-surface-sunken)',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                ID / FECHA
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                PROVEEDOR
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                COMPROBANTE
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                LÍNEAS
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                TOTAL
              </th>
              <th style={{ padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 800 }}>
                ESTADO
              </th>
              <th
                style={{
                  padding: '10px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 800,
                  textAlign: 'right',
                }}
              >
                ACCIONES
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoadingPurchases ? (
              <tr>
                <td
                  colSpan={7}
                  style={{ padding: '24px', textAlign: 'center', color: 'var(--color-ink-muted)' }}
                >
                  Cargando compras...
                </td>
              </tr>
            ) : purchases.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  data-testid="no-purchases-msg"
                  style={{ padding: '24px', textAlign: 'center', color: 'var(--color-ink-muted)' }}
                >
                  No se encontraron compras registradas con los filtros actuales.
                </td>
              </tr>
            ) : (
              purchases.map((pur: PurchaseResponse) => (
                <tr
                  key={pur.id}
                  data-testid={`purchase-row-${pur.id}`}
                  style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700 }}>#{pur.id.slice(-6).toUpperCase()}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                      {new Date(pur.createdAt).toLocaleDateString('es-AR')}
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                    {pur.supplier?.name || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>
                    {pur.documentNumber || '—'}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {pur.itemsCount !== undefined ? `${pur.itemsCount} items` : '—'}
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 800 }}>
                    {Money.fromCents(pur.totalCents).format()}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{getStatusBadge(pur.status)}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <button className="pulso-button pulso-button--md"
                      type="button"
                      data-testid={`view-purchase-${pur.id}`}
                      onClick={() => loadPurchaseDetail(pur.id, context)}
                      disabled={isOffline}
                      style={{
                        padding: '4px 10px',
                        fontSize: 'var(--text-xs)',
                        border: '2px solid var(--color-border)',
                        backgroundColor: 'var(--color-surface)',
                        borderRadius: 'var(--radius-xs)',
                        cursor: isOffline ? 'not-allowed' : 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      Ver Detalle
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {purchasesTotalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              borderTop: '1px solid var(--color-border)',
              fontSize: 'var(--text-xs)',
            }}
          >
            <span>
              Total: {purchasesTotal} compras (Página {purchasesPage} de {purchasesTotalPages})
            </span>
            <div style={{ display: 'flex', gap: 'var(--radius-sm, 8px)' }}>
              <button className="pulso-button pulso-button--md"
                type="button"
                data-testid="purchase-prev-page"
                onClick={() => handlePageChange(purchasesPage - 1)}
                disabled={purchasesPage <= 1 || isOffline}
                style={{
                  padding: '4px 8px',
                  border: '2px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: purchasesPage <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                Anterior
              </button>
              <button className="pulso-button pulso-button--md"
                type="button"
                data-testid="purchase-next-page"
                onClick={() => handlePageChange(purchasesPage + 1)}
                disabled={purchasesPage >= purchasesTotalPages || isOffline}
                style={{
                  padding: '4px 8px',
                  border: '2px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: purchasesPage >= purchasesTotalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedPurchase && (
        <PurchaseDetailModal
          onClose={closePurchaseDetail}
          context={context}
          isOffline={isOffline}
          onResume={onResume}
          onRefresh={() => loadPurchases(context, { page: purchasesPage })}
        />
      )}
    </div>
  );
};

