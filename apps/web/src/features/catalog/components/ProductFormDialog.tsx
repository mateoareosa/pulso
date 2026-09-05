import React from 'react';
import { IconClose } from '@pulso/icons';
import type { CategoryResponse } from '@pulso/contracts';
import type { CatalogProductItem } from '../store/catalog.store';

export interface ProductFormDialogProps {
  isOpen: boolean;
  editingProduct: CatalogProductItem | null;
  categories: CategoryResponse[];
  formName: string;
  formCategoryId: string;
  formBarcode: string;
  formSku: string;
  formPrice: string;
  formCost: string;
  formInitialStock: string;
  formMinStock: string;
  formQuickSlot: string;
  formIsActive: boolean;
  formIsAvailable: boolean;
  formError: string | null;
  isSubmitting: boolean;
  isCreatingCategory: boolean;
  newCategoryName: string;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onNameChange: (val: string) => void;
  onCategoryChange: (val: string) => void;
  onBarcodeChange: (val: string) => void;
  onSkuChange: (val: string) => void;
  onPriceChange: (val: string) => void;
  onCostChange: (val: string) => void;
  onInitialStockChange: (val: string) => void;
  onMinStockChange: (val: string) => void;
  onQuickSlotChange: (val: string) => void;
  onIsActiveToggle: () => void;
  onIsAvailableToggle: () => void;
  onStartCreateCategory: () => void;
  onCancelCreateCategory: () => void;
  onNewCategoryNameChange: (val: string) => void;
  onCreateCategory: () => void;
}

export const ProductFormDialog: React.FC<ProductFormDialogProps> = ({
  isOpen,
  editingProduct,
  categories,
  formName,
  formCategoryId,
  formBarcode,
  formSku,
  formPrice,
  formCost,
  formInitialStock,
  formMinStock,
  formQuickSlot,
  formIsActive,
  formIsAvailable,
  formError,
  isSubmitting,
  isCreatingCategory,
  newCategoryName,
  onClose,
  onSubmit,
  onNameChange,
  onCategoryChange,
  onBarcodeChange,
  onSkuChange,
  onPriceChange,
  onCostChange,
  onInitialStockChange,
  onMinStockChange,
  onQuickSlotChange,
  onIsActiveToggle,
  onIsAvailableToggle,
  onStartCreateCategory,
  onCancelCreateCategory,
  onNewCategoryNameChange,
  onCreateCategory,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
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
          maxWidth: '560px',
          maxHeight: '90vh',
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
          <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 800 }}>
            {editingProduct ? 'EDITAR PRODUCTO' : 'ALTA DE PRODUCTO'}
          </h2>
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

        {formError && (
          <div
            role="alert"
            style={{
              backgroundColor: 'var(--color-surface-sunken)',
              border: '1px solid var(--color-danger, #D32F2F)',
              color: 'var(--color-danger, #D32F2F)',
              padding: '10px 12px',
              marginBottom: '16px',
              fontSize: 'var(--text-sm)',
              fontWeight: 700,
            }}
          >
            {formError}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                marginBottom: '4px',
              }}
            >
              NOMBRE DEL PRODUCTO *
            </label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Ej: Alfajor Triple Chocolate"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface-sunken)',
                color: 'var(--color-ink)',
                fontSize: 'var(--text-sm)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Categoría */}
          <div style={{ marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontWeight: 700, fontSize: 'var(--text-xs)' }}>CATEGORÍA</label>
              {!isCreatingCategory && (
                <button
                  type="button"
                  onClick={onStartCreateCategory}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    color: 'var(--color-pulse-text)',
                    cursor: 'pointer',
                  }}
                >
                  + Nueva categoría
                </button>
              )}
            </div>

            {isCreatingCategory ? (
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="text"
                  placeholder="Nombre de nueva categoría..."
                  value={newCategoryName}
                  onChange={(e) => onNewCategoryNameChange(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-surface-sunken)',
                    color: 'var(--color-ink)',
                    fontSize: 'var(--text-sm)',
                  }}
                />
                <button
                  type="button"
                  onClick={onCreateCategory}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'var(--color-pulse-solid)',
                    color: '#0f172a',
                    border: 'none',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Crear
                </button>
                <button
                  type="button"
                  onClick={onCancelCreateCategory}
                  style={{
                    padding: '6px',
                    background: 'none',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                  }}
                >
                  <IconClose size={16} />
                </button>
              </div>
            ) : (
              <select
                value={formCategoryId}
                onChange={(e) => onCategoryChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink)',
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Sin categoría asignada</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Barcode & SKU */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '14px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '4px',
                }}
              >
                CÓDIGO DE BARRAS
              </label>
              <input
                type="text"
                value={formBarcode}
                onChange={(e) => onBarcodeChange(e.target.value)}
                placeholder="779..."
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '4px',
                }}
              >
                SKU INTERNO
              </label>
              <input
                type="text"
                value={formSku}
                onChange={(e) => onSkuChange(e.target.value)}
                placeholder="ALF-001"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Precios */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '14px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '4px',
                }}
              >
                PRECIO DE VENTA ($) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={formPrice}
                onChange={(e) => onPriceChange(e.target.value)}
                placeholder="1200.00"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '4px',
                }}
              >
                COSTO ESTIMADO ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formCost}
                onChange={(e) => onCostChange(e.target.value)}
                placeholder="750.00"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Slot Rápido & Stocks */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '14px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '4px',
                }}
              >
                SLOT RÁPIDO (1–8)
              </label>
              <select
                value={formQuickSlot}
                onChange={(e) => onQuickSlotChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink)',
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">Sin slot rápido</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Slot [{s}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '4px',
                }}
              >
                STOCK MÍNIMO ALERTA
              </label>
              <input
                type="number"
                step="1"
                value={formMinStock}
                onChange={(e) => onMinStockChange(e.target.value)}
                placeholder="10"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Initial Stock (Only on create) */}
          {!editingProduct && (
            <div style={{ marginBottom: '14px' }}>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '4px',
                }}
              >
                STOCK INICIAL
              </label>
              <input
                type="number"
                step="1"
                value={formInitialStock}
                onChange={(e) => onInitialStockChange(e.target.value)}
                placeholder="50"
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-sunken)',
                  color: 'var(--color-ink)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}

          {/* Dual Toggles: Global Active Status & Branch Availability (Points 3 & 4) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '14px',
              padding: '12px',
              backgroundColor: 'var(--color-surface-sunken)',
              borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--color-border)',
            }}
          >
            {/* Global Active/Inactive */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '6px',
                }}
              >
                ESTADO GENERAL
              </label>
              <button
                type="button"
                onClick={onIsActiveToggle}
                aria-label={`Estado general del producto: ${formIsActive ? 'Activo' : 'Inactivo'}`}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: formIsActive
                    ? 'var(--color-pulse-soft)'
                    : 'var(--color-surface)',
                  color: formIsActive ? 'var(--color-pulse-text)' : 'var(--color-ink-muted)',
                  fontWeight: 800,
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                {formIsActive ? 'PRODUCTO ACTIVO' : 'PRODUCTO INACTIVO'}
              </button>
            </div>

            {/* Branch Availability Toggle (Point 4) */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontWeight: 700,
                  fontSize: 'var(--text-xs)',
                  marginBottom: '6px',
                }}
              >
                SUCURSAL ACTUAL
              </label>
              <button
                type="button"
                onClick={onIsAvailableToggle}
                aria-label={`Disponibilidad en esta sucursal: ${formIsAvailable ? 'Disponible' : 'No disponible'}`}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-xs)',
                  border: formIsAvailable
                    ? '1px solid var(--color-border)'
                    : '1px solid var(--color-danger, #D32F2F)',
                  backgroundColor: formIsAvailable
                    ? 'var(--color-surface)'
                    : 'rgba(239, 68, 68, 0.1)',
                  color: formIsAvailable ? 'var(--color-ink)' : 'var(--color-danger, #D32F2F)',
                  fontWeight: 800,
                  fontSize: 'var(--text-xs)',
                  cursor: 'pointer',
                }}
              >
                {formIsAvailable ? 'DISPONIBLE EN SUCURSAL' : 'NO DISPONIBLE'}
              </button>
            </div>
          </div>

          {/* Botones de acción */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              borderTop: '1px solid var(--color-border)',
              paddingTop: '16px',
              marginTop: '16px',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-xs)',
                fontWeight: 700,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                color: 'var(--color-ink)',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '8px 20px',
                backgroundColor: 'var(--color-pulse-solid)',
                color: '#0f172a',
                border: 'none',
                borderRadius: 'var(--radius-xs)',
                fontWeight: 800,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
              }}
            >
              {isSubmitting ? 'Guardando...' : editingProduct ? 'ACTUALIZAR' : 'CREAR PRODUCTO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
