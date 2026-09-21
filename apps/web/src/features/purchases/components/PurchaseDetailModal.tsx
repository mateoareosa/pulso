import React from 'react';
import { usePurchasesStore } from '../store/purchases.store';
import { Money } from '@pulso/domain';
import type { PurchaseDetailResponse } from '@pulso/contracts';

interface PurchaseDetailModalProps {
  onClose: () => void;
  context: { tenantId: string; locationId: string };
  isOffline: boolean;
  onResume: (draft: PurchaseDetailResponse) => void;
  onRefresh: () => void;
}

export const PurchaseDetailModal: React.FC<PurchaseDetailModalProps> = ({
  onClose,
  context,
  isOffline,
  onResume,
  onRefresh,
}) => {
  const {
    selectedPurchase,
    isLoadingDetail,
    detailError,
    isSubmitting,
    actionError,
    prepareReceiveIntent,
    receivePurchase,
    cancelPurchase,
  } = usePurchasesStore();
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const originRef = React.useRef<HTMLElement | null>(null);
  const cancelTriggerRef = React.useRef<HTMLButtonElement>(null);
  const cancelReasonRef = React.useRef<HTMLInputElement>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const receiveActionRef = React.useRef<HTMLButtonElement>(null);
  const contextKey = `${context.tenantId}::${context.locationId}`;
  const latestContextKeyRef = React.useRef(contextKey);
  latestContextKeyRef.current = contextKey;

  React.useEffect(() => {
    originRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = dialogRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    (first ?? dialogRef.current)?.focus();
    return () => { if (originRef.current?.isConnected) originRef.current.focus(); };
  }, []);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (confirmingCancel) dismissCancel(); else onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  });

  React.useEffect(() => {
    if (confirmingCancel) cancelReasonRef.current?.focus();
  }, [confirmingCancel]);

  React.useEffect(() => {
    if (!actionError || isSubmitting) return;
    const recoveryControl = receiveActionRef.current;
    if (recoveryControl && !recoveryControl.disabled) recoveryControl.focus();
    else closeButtonRef.current?.focus();
  }, [actionError, isSubmitting]);

  const dismissCancel = () => {
    setConfirmingCancel(false);
    cancelTriggerRef.current?.focus();
  };

  if (isLoadingDetail) {
    return (
      <div ref={dialogRef} tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de compra"
        aria-busy="true"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'var(--color-overlay, rgba(0,0,0,0.5))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          role="status"
          style={{
            backgroundColor: 'var(--color-surface, #ffffff)',
            borderRadius: 'var(--radius-sm, 8px)',
            padding: '24px',
            maxWidth: '500px',
            textAlign: 'center',
          }}
        >
          Cargando detalle de la compra...
        </div>
      </div>
    );
  }

  if (detailError || !selectedPurchase) {
    return (
      <div ref={dialogRef} tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de compra"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'var(--color-overlay, rgba(0,0,0,0.5))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          role="region"
          aria-label="Estado de compra"
          style={{
            backgroundColor: 'var(--color-surface, #ffffff)',
            borderRadius: 'var(--radius-sm, 8px)',
            padding: '24px',
            maxWidth: '500px',
            textAlign: 'center',
          }}
        >
          <p role="alert" aria-label="Compra no disponible" style={{ color: 'var(--color-danger-solid)' }}>
            {actionError || detailError || 'No se encontró la compra solicitada.'}
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{
              marginTop: 'var(--radius-pill, 12px)',
              padding: '8px 16px',
              backgroundColor: 'var(--color-surface)',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const p = selectedPurchase;
  const isDraft = p.status === 'DRAFT';
  const performReceive = async () => {
    if (!isDraft || isOffline || isSubmitting) return;
    const startedContextKey = contextKey;
    const receiveKey = prepareReceiveIntent();
    const ok = await receivePurchase(
      p.id,
      { idempotencyKey: receiveKey, paymentSource: p.paymentSource },
      context
    );
    if (latestContextKeyRef.current !== startedContextKey) return;
    if (ok) {
      onRefresh();
      onClose();
    } else onRefresh();
  };
  const performCancel = async () => {
    if (!isDraft || isOffline || isSubmitting) return;
    const startedContextKey = contextKey;
    const ok = await cancelPurchase(p.id, { reason: cancelReason.trim() || undefined }, context);
    if (latestContextKeyRef.current !== startedContextKey) return;
    if (ok) {
      setConfirmingCancel(false);
      onRefresh();
      onClose();
    } else onRefresh();
  };

  const statusLabel =
    p.status === 'RECEIVED' ? 'RECIBIDA' : p.status === 'CANCELLED' ? 'CANCELADA' : 'BORRADOR';
  const statusColor =
    p.status === 'RECEIVED'
      ? { bg: 'var(--color-success-soft, #dcfce7)', text: 'var(--color-success-strong, #166534)' }
      : p.status === 'CANCELLED'
        ? { bg: 'var(--color-danger-soft, #fee2e2)', text: 'var(--color-danger-solid)' }
        : { bg: 'var(--color-warning-soft, #fef3c7)', text: 'var(--color-warning, #b45309)' };

  const paymentLabel =
    p.paymentSource === 'CASH_REGISTER'
      ? 'Egreso de Caja (Turno Actual)'
      : p.paymentSource === 'OUTSIDE_CASH'
        ? 'Fondos Externos / Fuera de Caja'
        : 'Sin especificar';

  return (
    <div ref={dialogRef} tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-detail-title"
      aria-busy={isSubmitting}
      data-testid="purchase-detail-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'var(--color-overlay, rgba(0,0,0,0.5))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface, #ffffff)',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '24px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: '1px solid var(--color-border)',
            paddingBottom: 'var(--radius-pill, 12px)',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--radius-sm, 8px)' }}>
              <h2
                id="purchase-detail-title"
                style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}
              >
                Compra #{p.id.slice(-6).toUpperCase()}
              </h2>
              <span
                data-testid="purchase-detail-status"
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-pill, 12px)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  backgroundColor: statusColor.bg,
                  color: statusColor.text,
                }}
              >
                {statusLabel}
              </span>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)', marginTop: 'var(--radius-xs, 4px)' }}>
              Creada el: {new Date(p.createdAt).toLocaleString('es-AR')}
              {p.receivedAtUtc &&
                ` · Recibida el: ${new Date(p.receivedAtUtc).toLocaleString('es-AR')}`}
            </div>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            data-testid="close-purchase-detail-btn"
            onClick={onClose}
            aria-label="Cerrar detalle"
            style={{
              background: 'none',
              border: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              color: 'var(--color-ink-muted)',
            }}
          >
            ✕
          </button>
        </div>

        {actionError && (
          <div
            role="alert"
            data-testid="purchase-detail-action-error"
            style={{ color: 'var(--color-danger-text)', marginBottom: 12 }}
          >
            {actionError}
          </div>
        )}
        {isSubmitting && (
          <p role="status" aria-live="polite">
            Procesando operación de compra...
          </p>
        )}
        {isDraft && (
          <div
            role="group"
            aria-label="Acciones del borrador"
            style={{ display: 'flex', gap: 8, marginBottom: 16 }}
          >
            <button
              type="button"
              data-testid="resume-purchase-btn"
              onClick={() => onResume(p)}
              disabled={isOffline || isSubmitting}
            >
              Reanudar edición
            </button>
            <button
              type="button"
              ref={receiveActionRef}
              data-testid="receive-draft-btn"
              onClick={performReceive}
              disabled={isOffline || isSubmitting}
            >
              Recibir compra
            </button>
            <button
              type="button"
              ref={cancelTriggerRef}
              data-testid="cancel-draft-btn"
              onClick={() => setConfirmingCancel(true)}
              disabled={isOffline || isSubmitting}
            >
              Cancelar borrador
            </button>
          </div>
        )}
        {confirmingCancel && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-purchase-title"
            style={{ border: '2px solid var(--color-border)', padding: 12, marginBottom: 16 }}
          >
            <h3 id="cancel-purchase-title">¿Cancelar este borrador?</h3>
            <label htmlFor="cancel-reason">Motivo (opcional)</label>
            <input
              id="cancel-reason"
              ref={cancelReasonRef}
              data-testid="cancel-reason-input"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                type="button"
                data-testid="confirm-cancel-btn"
                onClick={performCancel}
                disabled={isSubmitting}
              >
                Confirmar cancelación
              </button>
              <button type="button" onClick={dismissCancel} disabled={isSubmitting}>
                Volver
              </button>
            </div>
          </div>
        )}

        {/* Info Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--radius-pill, 12px)',
            backgroundColor: 'var(--color-surface-subtle, rgba(0,0,0,0.02))',
            padding: 'var(--radius-pill, 12px)',
            borderRadius: 'var(--radius-sm, 6px)',
            marginBottom: '16px',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-ink-muted)', fontWeight: 700 }}>
              PROVEEDOR
            </div>
            <div style={{ fontWeight: 700 }}>{p.supplier?.name || '—'}</div>
            {p.supplier?.taxId && (
              <div style={{ fontSize: '11px', fontFamily: 'monospace' }}>
                CUIT: {p.supplier.taxId}
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-ink-muted)', fontWeight: 700 }}>
              COMPROBANTE / FACTURA
            </div>
            <div>{p.documentNumber || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '11px', color: 'var(--color-ink-muted)', fontWeight: 700 }}>
              ORIGEN DE PAGO
            </div>
            <div data-testid="purchase-detail-payment-source">{paymentLabel}</div>
            {p.cashMovementId && (
              <div style={{ fontSize: '11px', color: 'var(--color-success-strong, #166534)', fontWeight: 600 }}>
                Movimiento de caja: #{p.cashMovementId.slice(-6)}
              </div>
            )}
          </div>
          {p.notes && (
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={{ fontSize: '11px', color: 'var(--color-ink-muted)', fontWeight: 700 }}>
                OBSERVACIONES
              </div>
              <div>{p.notes}</div>
            </div>
          )}
        </div>

        {/* Items List */}
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: 800 }}>
            LÍNEAS DE ARTÍCULOS
          </h3>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-surface-subtle, rgba(0,0,0,0.02))',
                }}
              >
                <th style={{ padding: 'var(--radius-sm, 8px)' }}>PRODUCTO</th>
                <th style={{ padding: 'var(--radius-sm, 8px)', textAlign: 'center' }}>CANTIDAD</th>
                <th style={{ padding: 'var(--radius-sm, 8px)', textAlign: 'right' }}>COSTO UNIT.</th>
                <th style={{ padding: 'var(--radius-sm, 8px)', textAlign: 'right' }}>SUBTOTAL</th>
              </tr>
            </thead>
            <tbody>
              {p.items.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: 'var(--radius-sm, 8px)' }}>
                    <div style={{ fontWeight: 600 }}>{item.productNameSnapshot}</div>
                    {item.barcodeSnapshot && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-ink-muted)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {item.barcodeSnapshot}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: 'var(--radius-sm, 8px)', textAlign: 'center', fontWeight: 700 }}>
                    {item.quantity} un.
                  </td>
                  <td style={{ padding: 'var(--radius-sm, 8px)', textAlign: 'right' }}>
                    {Money.fromCents(item.unitCostCents).format()}
                  </td>
                  <td style={{ padding: 'var(--radius-sm, 8px)', textAlign: 'right', fontWeight: 700 }}>
                    {Money.fromCents(item.lineTotalCents).format()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Summary */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--radius-xs, 4px)',
            alignItems: 'flex-end',
            borderTop: '1px solid var(--color-border)',
            paddingTop: 'var(--radius-pill, 12px)',
          }}
        >
          <div style={{ display: 'flex', gap: '24px', fontSize: '13px' }}>
            <span style={{ color: 'var(--color-ink-muted)' }}>Subtotal artículos:</span>
            <span style={{ fontWeight: 600 }}>{Money.fromCents(p.subtotalCents).format()}</span>
          </div>
          {p.discountCents > 0 && (
            <div style={{ display: 'flex', gap: '24px', fontSize: '13px' }}>
              <span style={{ color: 'var(--color-ink-muted)' }}>Descuento:</span>
              <span style={{ color: 'var(--color-success-strong, #166534)' }}>-{Money.fromCents(p.discountCents).format()}</span>
            </div>
          )}
          {p.additionalCostCents > 0 && (
            <div style={{ display: 'flex', gap: '24px', fontSize: '13px' }}>
              <span style={{ color: 'var(--color-ink-muted)' }}>Costos adicionales (Flete):</span>
              <span>+{Money.fromCents(p.additionalCostCents).format()}</span>
            </div>
          )}
          <div
            style={{
              display: 'flex',
              gap: '24px',
              fontSize: '16px',
              fontWeight: 800,
              marginTop: 'var(--radius-xs, 4px)',
              borderTop: '1px dashed var(--color-border)',
              paddingTop: 'var(--radius-sm, 6px)',
            }}
          >
            <span>TOTAL COMPRA:</span>
            <span data-testid="purchase-detail-total">
              {Money.fromCents(p.totalCents).format()}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: 'var(--color-surface)',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-xs, 4px)',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

