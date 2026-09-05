import React from 'react';
import { Money } from '@pulso/domain';
import { IconStock, IconEdit, IconHistory } from '@pulso/icons';
import type { CatalogProductItem } from '../store/catalog.store';

export interface ProductsTableProps {
  products: CatalogProductItem[];
  filteredProducts: CatalogProductItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
  searchFilter: string;
  onRetry: () => void;
  onOpenCreate: () => void;
  onOpenAdjust: (product: CatalogProductItem) => void;
  onOpenEdit: (product: CatalogProductItem) => void;
  onOpenHistory: (product: CatalogProductItem) => void;
  onPageChange: (newPage: number) => void;
}

export const ProductsTable: React.FC<ProductsTableProps> = ({
  products,
  filteredProducts,
  total,
  page,
  limit: _limit,
  totalPages,
  isLoading,
  error,
  searchFilter,
  onRetry,
  onOpenCreate,
  onOpenAdjust,
  onOpenEdit,
  onOpenHistory,
  onPageChange,
}) => {
  if (isLoading && products.length === 0) {
    return (
      <div
        role="status"
        style={{
          padding: '40px',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface-sunken)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-ink-muted)',
        }}
      >
        Cargando productos e inventario...
      </div>
    );
  }

  if (error && products.length === 0) {
    return (
      <div
        role="alert"
        style={{
          padding: '24px',
          backgroundColor: 'var(--color-surface-sunken)',
          border: '2px solid var(--color-danger, #D32F2F)',
          color: 'var(--color-ink)',
        }}
      >
        <p style={{ margin: 0, fontWeight: 700 }}>{error}</p>
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: '10px',
            padding: '6px 12px',
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (filteredProducts.length === 0) {
    return (
      <div
        role="status"
        style={{
          padding: '48px 16px',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface-sunken)',
          border: '2px dashed var(--color-border)',
          color: 'var(--color-ink-muted)',
        }}
      >
        <p style={{ fontWeight: 800, fontSize: 'var(--text-base)', margin: '0 0 8px' }}>
          {searchFilter ? `Sin coincidencias para "${searchFilter}"` : 'El catálogo está vacío.'}
        </p>
        <p style={{ fontSize: 'var(--text-sm)', margin: '0 0 16px' }}>
          {searchFilter
            ? 'Intentá buscar por otro término o limpiá la búsqueda.'
            : 'Dá de alta tu primer producto haciendo clic en "Nuevo Producto".'}
        </p>
        {!searchFilter && (
          <button
            type="button"
            onClick={onOpenCreate}
            style={{
              backgroundColor: 'var(--color-pulse-solid)',
              color: '#0f172a',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 'var(--radius-xs)',
              fontWeight: 800,
              fontSize: 'var(--text-xs)',
              cursor: 'pointer',
            }}
          >
            CREAR PRIMER PRODUCTO
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--text-sm)',
            textAlign: 'left',
            backgroundColor: 'var(--color-surface)',
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: 'var(--color-surface-sunken)',
                borderBottom: '2px solid var(--color-border)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 800,
                color: 'var(--color-ink-muted)',
                textTransform: 'uppercase',
              }}
            >
              <th style={{ padding: '10px 12px' }}>Estado</th>
              <th style={{ padding: '10px 12px' }}>Sucursal</th>
              <th style={{ padding: '10px 12px' }}>Slot</th>
              <th style={{ padding: '10px 12px' }}>Producto</th>
              <th style={{ padding: '10px 12px' }}>Código / SKU</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Precio</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Costo</th>
              <th style={{ padding: '10px 12px', textAlign: 'right' }}>Stock</th>
              <th style={{ padding: '10px 12px', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((p) => {
              const stockVal = parseFloat(p.stockQuantity);
              const minVal = parseFloat(p.minimumStock);
              const isLowStock = stockVal <= minVal;

              return (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    opacity: p.isActive ? 1 : 0.6,
                  }}
                >
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-xs)',
                        backgroundColor: p.isActive
                          ? 'var(--color-pulse-soft)'
                          : 'var(--color-surface-sunken)',
                        color: p.isActive ? 'var(--color-pulse-text)' : 'var(--color-ink-muted)',
                      }}
                    >
                      {p.isActive ? 'ACTIVO' : 'INACTIVO'}
                    </span>
                  </td>

                  {/* Branch Availability indicator (Point 4) */}
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      aria-label={`Disponibilidad en sucursal: ${p.isAvailable ? 'Disponible' : 'No disponible'}`}
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 800,
                        padding: '2px 6px',
                        borderRadius: 'var(--radius-xs)',
                        backgroundColor: p.isAvailable
                          ? 'var(--color-surface-sunken)'
                          : 'rgba(239, 68, 68, 0.1)',
                        border: p.isAvailable
                          ? '1px solid var(--color-border)'
                          : '1px solid var(--color-danger, #D32F2F)',
                        color: p.isAvailable ? 'var(--color-ink)' : 'var(--color-danger, #D32F2F)',
                      }}
                    >
                      {p.isAvailable ? 'DISPONIBLE' : 'NO DISPONIBLE'}
                    </span>
                  </td>

                  <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)' }}>
                    {p.quickSlot ? (
                      <span
                        style={{
                          fontWeight: 800,
                          backgroundColor: 'var(--color-surface-sunken)',
                          border: '1px solid var(--color-ink)',
                          padding: '1px 5px',
                          borderRadius: 'var(--radius-xs)',
                        }}
                      >
                        [{p.quickSlot}]
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-ink-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--color-ink)' }}>{p.name}</div>
                    <div
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-ink-muted)',
                        textTransform: 'uppercase',
                      }}
                    >
                      {p.category}
                    </div>
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                    }}
                  >
                    {p.barcode && <div>BAR: {p.barcode}</div>}
                    {p.sku && <div style={{ color: 'var(--color-ink-muted)' }}>SKU: {p.sku}</div>}
                    {!p.barcode && !p.sku && (
                      <span style={{ color: 'var(--color-ink-muted)' }}>—</span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 800,
                    }}
                  >
                    {Money.fromCents(p.salePriceCents).format()}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-ink-muted)',
                    }}
                  >
                    {p.costPriceCents ? Money.fromCents(p.costPriceCents).format() : '—'}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: isLowStock ? 'var(--color-danger, #D32F2F)' : 'var(--color-ink)',
                    }}
                  >
                    {stockVal.toFixed(0)}
                    {isLowStock && <span title="Bajo stock crítico"> ⚠️</span>}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => onOpenAdjust(p)}
                        title="Ajustar stock"
                        style={{
                          padding: '4px 8px',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 700,
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-xs)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <IconStock size={14} />
                        <span>Stock</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenEdit(p)}
                        title="Editar producto"
                        style={{
                          padding: '4px 8px',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 700,
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-xs)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <IconEdit size={14} />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenHistory(p)}
                        title="Ver movimientos"
                        style={{
                          padding: '4px 8px',
                          fontSize: 'var(--text-xs)',
                          fontWeight: 700,
                          backgroundColor: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          cursor: 'pointer',
                          borderRadius: 'var(--radius-xs)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <IconHistory size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination controls (Point 1) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 4px',
          fontSize: 'var(--text-xs)',
          color: 'var(--color-ink-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <span>
          Página {page} de {totalPages || 1} ({total} productos totales)
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            style={{
              padding: '4px 10px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.5 : 1,
              fontWeight: 700,
            }}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            style={{
              padding: '4px 10px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xs)',
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.5 : 1,
              fontWeight: 700,
            }}
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
};
