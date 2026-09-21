import React, { useState, useEffect, useRef } from 'react';
import { Money } from '@pulso/domain';
import { IconAlert, IconClose } from '@pulso/icons';

interface CashMovementModalProps {
  type: 'CASH_IN' | 'CASH_OUT';
  currentExpectedCents: number;
  isSubmitting: boolean;
  onConfirm: (amountCents: number, reason: string) => Promise<boolean>;
  onClose: () => void;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = ({
  type,
  currentExpectedCents,
  isSubmitting,
  onConfirm,
  onClose,
}) => {
  const [amountStr, setAmountStr] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [localError, setLocalError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const isBusy = isSubmitting || isSubmittingRef.current;
  const isCashOut = type === 'CASH_OUT';
  const title = isCashOut ? 'Retiro Manual de Efectivo' : 'Ingreso Manual de Efectivo';

  const normalizedInput = amountStr.replace(',', '.');
  const amountCents = normalizedInput
    ? Math.max(0, Math.round(parseFloat(normalizedInput) * 100))
    : 0;

  const isExceeding = isCashOut && amountCents > currentExpectedCents;

  const handleAppend = (char: string) => {
    if (isBusy) return;
    setAmountStr((prev) => {
      if (char === '.' || char === ',') {
        if (prev.includes('.') || prev.includes(',')) return prev;
        return prev ? `${prev}.` : '0.';
      }
      const dotIdx = prev.indexOf('.');
      if (dotIdx !== -1 && prev.length - dotIdx > 2) return prev;
      if (prev === '0') {
        if (char === '0' || char === '00') return '0';
        return char;
      }
      if (char === '00') {
        if (!prev) return '0';
        if (dotIdx !== -1) {
          const decimalsLeft = 2 - (prev.length - dotIdx - 1);
          if (decimalsLeft < 2) return prev;
        }
        return `${prev}00`;
      }
      return `${prev}${char}`;
    });
  };

  const handleBackspace = () => {
    if (isBusy) return;
    setAmountStr((prev) => (prev.length > 1 ? prev.slice(0, -1) : ''));
  };

  const handleSubmit = async () => {
    if (isBusy) return;
    if (amountCents <= 0) {
      setLocalError('El monto debe ser mayor a 0');
      return;
    }
    if (!reason.trim() || reason.trim().length < 3) {
      setLocalError('El motivo es obligatorio y debe tener al menos 3 caracteres');
      return;
    }
    if (isExceeding) {
      setLocalError('El monto de retiro supera el saldo disponible en caja');
      return;
    }

    setLocalError(null);
    isSubmittingRef.current = true;
    try {
      const ok = await onConfirm(amountCents, reason.trim());
      if (ok) {
        onClose();
      }
    } finally {
      isSubmittingRef.current = false;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface, #fff)',
          border: '1px solid var(--color-border, rgba(0,0,0,0.2))',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '24px',
          maxWidth: '460px',
          width: '100%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 'var(--text-lg, 18px)', fontWeight: 900, margin: 0 }}>{title}</h2>
          <button
            type="button"
            aria-label="Cerrar ventana"
            onClick={onClose}
            disabled={isBusy}
            style={{
              background: 'none',
              border: 'none',
              cursor: isBusy ? 'not-allowed' : 'pointer',
              color: 'var(--color-ink-muted, #666)',
              padding: '4px',
            }}
          >
            <IconClose size={20} />
          </button>
        </div>

        {isCashOut && (
          <div
            style={{
              backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.03))',
              border: '1px solid var(--color-border, #ddd)',
              borderRadius: 'var(--radius-xs, 4px)',
              padding: '8px 12px',
              fontSize: 'var(--text-xs, 12px)',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ color: 'var(--color-ink-muted, #666)' }}>Saldo disponible en caja:</span>
            <span style={{ fontWeight: 800, fontFamily: 'monospace, var(--font-mono)' }}>
              {Money.fromCents(currentExpectedCents).format()}
            </span>
          </div>
        )}

        {localError && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(220, 53, 69, 0.12)',
              color: 'var(--color-danger-solid)',
              border: '1px solid var(--color-danger-solid)',
              borderRadius: 'var(--radius-xs, 4px)',
              padding: '8px 12px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 700,
            }}
          >
            <IconAlert size={16} />
            <span>{localError}</span>
          </div>
        )}

        {/* Amount Display */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #fff)',
            border: `2px solid ${isExceeding ? 'var(--color-danger-solid)' : 'var(--color-ink, #000)'}`,
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '10px 14px',
            textAlign: 'right',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #666)',
              textTransform: 'uppercase',
            }}
          >
            Monto a {isCashOut ? 'retirar' : 'ingresar'}
          </div>
          <div
            data-testid="movement-amount-display"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-xl, 24px)',
              fontWeight: 900,
              color: isExceeding ? 'var(--color-danger-solid)' : 'var(--color-ink, #000)',
            }}
          >
            {Money.fromCents(amountCents).format()}
          </div>
        </div>

        {/* Motivo Input */}
        <div>
          <label
            htmlFor="cash-movement-reason"
            style={{
              display: 'block',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--color-ink-muted, #666)',
              marginBottom: '4px',
            }}
          >
            Motivo de la operación (obligatorio)
          </label>
          <input
            id="cash-movement-reason"
            type="text"
            data-testid="movement-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={isBusy}
            placeholder={
              isCashOut ? 'Ej: Pago a repartidor de hielo' : 'Ej: Reposición de cambio chica'
            }
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 'var(--text-sm, 14px)',
              borderRadius: 'var(--radius-xs, 4px)',
              border: '1px solid var(--color-border, #ccc)',
              backgroundColor: 'var(--color-surface, #fff)',
              color: 'var(--color-ink)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Keypad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '6px',
          }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((k) => (
            <button
              key={k}
              type="button"
              disabled={isBusy}
              onClick={() => {
                if (k === 'C') setAmountStr('');
                else if (k === '⌫') handleBackspace();
                else handleAppend(k);
              }}
              style={{
                minHeight: '40px',
                fontSize: 'var(--text-md, 16px)',
                fontWeight: 800,
                backgroundColor: 'var(--color-surface, #fff)',
                color: 'var(--color-ink, #000)',
                border: '1px solid var(--color-border, #ccc)',
                borderRadius: 'var(--radius-xs, 4px)',
                cursor: isBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            style={{
              flex: 1,
              minHeight: '46px',
              fontSize: 'var(--text-sm, 14px)',
              fontWeight: 800,
              backgroundColor: 'transparent',
              color: 'var(--color-ink)',
              border: '1px solid var(--color-border, #ccc)',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor: isBusy ? 'not-allowed' : 'pointer',
            }}
          >
            CANCELAR
          </button>
          <button
            type="button"
            data-testid="confirm-movement-button"
            disabled={isBusy || isExceeding || amountCents <= 0 || reason.trim().length < 3}
            onClick={handleSubmit}
            style={{
              flex: 2,
              minHeight: '46px',
              fontSize: 'var(--text-sm, 14px)',
              fontWeight: 900,
              backgroundColor: isCashOut
                ? 'var(--color-danger-solid)'
                : 'var(--color-success-solid)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor:
                isBusy || isExceeding || amountCents <= 0 || reason.trim().length < 3
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            {isBusy ? 'REGISTRANDO...' : isCashOut ? 'CONFIRMAR RETIRO' : 'CONFIRMAR INGRESO'}
          </button>
        </div>
      </div>
    </div>
  );
};
