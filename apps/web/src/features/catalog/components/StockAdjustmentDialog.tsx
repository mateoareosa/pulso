import React from 'react';
import { IconClose } from '@pulso/icons';
import type { InventoryMovementType } from '@pulso/contracts';
import type { CatalogProductItem } from '../store/catalog.store';

export interface StockAdjustmentDialogProps {
  isOpen: boolean;
  adjustingProduct: CatalogProductItem | null;
  adjustType: InventoryMovementType;
  adjustQty: string;
  adjustReason: string;
  adjustError: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onTypeChange: (type: InventoryMovementType) => void;
  onQtyChange: (qty: string) => void;
  onReasonChange: (reason: string) => void;
}

export const StockAdjustmentDialog: React.FC<StockAdjustmentDialogProps> = ({
  isOpen,
  adjustingProduct,
  adjustType,
  adjustQty,
  adjustReason,
  adjustError,
  isSubmitting,
  onClose,
  onSubmit,
  onTypeChange,
  onQtyChange,
  onReasonChange,
}) => {
  if (!isOpen || !adjustingProduct) return null;

  const currentStockNum = parseFloat(adjustingProduct.stockQuantity);
  const qtyNum = parseFloat(adjustQty) || 0;

  let projectedStock = currentStockNum;
  if (adjustType === 'ADJUSTMENT_IN') {
    projectedStock = currentStockNum + qtyNum;
  } else if (adjustType === 'ADJUSTMENT_OUT') {
    projectedStock = currentStockNum - qtyNum;
  } else if (adjustType === 'COUNT_CORRECTION') {
    projectedStock = qtyNum;
  }

  const isNegativeProjection = adjustType === 'ADJUSTMENT_OUT' && currentStockNum - qtyNum < 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ajuste Manual de Inventario"
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
          maxWidth: '480px',
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
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 800 }}>
              AJUSTE MANUAL DE INVENTARIO
            </h2>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              {adjustingProduct.name}
            </span>
          </div>
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

        {/* Current Stock info banner */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            backgroundColor: 'var(--color-surface-sunken)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-xs)',
            marginBottom: '16px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
              Stock actual:
            </span>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 800 }}>
              {currentStockNum.toFixed(0)}
            </div>
          </div>
          {adjustQty && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                Stock proyectado:
              </span>
              <div
                style={{
                  fontSize: 'var(--text-lg)',
                  fontWeight: 800,
                  color: isNegativeProjection
                    ? 'var(--color-danger, #D32F2F)'
                    : 'var(--color-pulse-text)',
                }}
              >
                {projectedStock.toFixed(0)}
              </div>
            </div>
          )}
        </div>

        {adjustError && (
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
            {adjustError}
          </div>
        )}

        <form onSubmit={onSubmit}>
          {/* Type */}
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                marginBottom: '4px',
              }}
            >
              TIPO DE MOVIMIENTO *
            </label>
            <select
              value={adjustType}
              onChange={(e) => onTypeChange(e.target.value as InventoryMovementType)}
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
              <option value="ADJUSTMENT_IN">Entrada / Reposición (+)</option>
              <option value="ADJUSTMENT_OUT">Salida / Rotura / Pérdida (-)</option>
              <option value="COUNT_CORRECTION">Recuento Físico / Corrección (=)</option>
            </select>
          </div>

          {/* Quantity */}
          <div style={{ marginBottom: '14px' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                marginBottom: '4px',
              }}
            >
              {adjustType === 'COUNT_CORRECTION'
                ? 'CANTIDAD REAL CONTADA *'
                : 'CANTIDAD A AJUSTAR *'}
            </label>
            <input
              type="number"
              step="1"
              required
              value={adjustQty}
              onChange={(e) => onQtyChange(e.target.value)}
              placeholder="Ej: 10"
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-surface-sunken)',
                color: 'var(--color-ink)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-base)',
                fontWeight: 700,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Reason */}
          <div style={{ marginBottom: '16px' }}>
            <label
              style={{
                display: 'block',
                fontWeight: 700,
                fontSize: 'var(--text-xs)',
                marginBottom: '4px',
              }}
            >
              MOTIVO OBLIGATORIO DEL AJUSTE * (Mín. 3 caracteres)
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={adjustReason}
              onChange={(e) => onReasonChange(e.target.value)}
              placeholder="Ej: Llegada de proveedor, vencimiento, recuento quincenal..."
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

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              borderTop: '1px solid var(--color-border)',
              paddingTop: '16px',
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
              {isSubmitting ? 'Registrando...' : 'APLICAR AJUSTE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
