import React from 'react';
import { IconStock, IconPlus, IconSearch } from '@pulso/icons';
import type { CategoryResponse } from '@pulso/contracts';

export interface ProductsToolbarProps {
  tenantName?: string;
  locationName?: string;
  totalProducts: number;
  searchFilter: string;
  categoryFilter: string;
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE';
  categories: CategoryResponse[];
  onSearchChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onStatusChange: (status: 'ALL' | 'ACTIVE' | 'INACTIVE') => void;
  onOpenCreate: () => void;
}

export const ProductsToolbar: React.FC<ProductsToolbarProps> = ({
  tenantName,
  locationName,
  totalProducts,
  searchFilter,
  categoryFilter,
  statusFilter,
  categories,
  onSearchChange,
  onCategoryChange,
  onStatusChange,
  onOpenCreate,
}) => {
  return (
    <>
      {/* 1. Header Title & Actions */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px',
          borderBottom: '2px solid var(--color-border)',
          paddingBottom: '12px',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 'var(--text-xl)',
              fontWeight: 900,
              letterSpacing: '-0.5px',
              textTransform: 'uppercase',
              color: 'var(--color-ink)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <IconStock size={24} />
            <span>Productos e Inventario</span>
          </h1>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-ink-muted)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {tenantName} · {locationName} · {totalProducts} productos registrados
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              minHeight: '38px',
              boxShadow: 'var(--shadow-key)',
            }}
          >
            <IconPlus size={16} />
            <span>NUEVO PRODUCTO</span>
          </button>
        </div>
      </header>

      {/* 2. Filters & Search Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: '1 1 240px', position: 'relative' }}>
          <span
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-ink-muted)',
              pointerEvents: 'none',
            }}
          >
            <IconSearch size={16} />
          </span>
          <input
            type="search"
            placeholder="Buscar por nombre, código de barras o SKU..."
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 10px 8px 34px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-sm)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label
            htmlFor="cat-filter"
            style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-ink-muted)' }}
          >
            Categoría:
          </label>
          <select
            id="cat-filter"
            value={categoryFilter}
            onChange={(e) => onCategoryChange(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <option value="ALL">Todas las categorías</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label
            htmlFor="status-filter"
            style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-ink-muted)' }}
          >
            Estado:
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE')}
            style={{
              padding: '6px 12px',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-ink)',
              fontSize: 'var(--text-sm)',
            }}
          >
            <option value="ALL">Todos los estados</option>
            <option value="ACTIVE">Solo activos</option>
            <option value="INACTIVE">Solo inactivos</option>
          </select>
        </div>
      </div>
    </>
  );
};
