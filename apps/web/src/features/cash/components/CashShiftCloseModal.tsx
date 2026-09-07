import React, { useState, useEffect, useRef } from 'react';
import { Money } from '@pulso/domain';
import { IconAlert, IconClose, IconCheck } from '@pulso/icons';

interface CashShiftCloseModalProps {
  expectedAmountCents: number;
  isSubmitting: boolean;
  onConfirmClose: (countedAmountCents: number) => Promise<boolean>;
  onClose: () => void;
}

export const CashShiftCloseModal: React.FC<CashShiftCloseModalProps> = ({
  expectedAmountCents,
  isSubmitting,
  onConfirmClose,
  onClose,
}) => {
  const [countedStr, setCountedStr] = useState<string>('');
  const [confirmedCheckbox, setConfirmedCheckbox] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);

  const isBusy = isSubmitting || isSubmittingRef.current;

  const normalizedInput = countedStr.replace(',', '.');
  const countedAmountCents = normalizedInput
    ? Math.max(0, Math.round(parseFloat(normalizedInput) * 100))
    : 0;

  const differenceCents = countedAmountCents - expectedAmountCents;
  const isExact = differenceCents === 0;
  const isSobrante = differenceCents > 0;

  const handleAppend = (char: string) => {
    if (isBusy) return;
    setCountedStr((prev) => {
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
    setCountedStr((prev) => (prev.length > 1 ? prev.slice(0, -1) : ''));
  };

  const handleExactShortcut = () => {
    if (isBusy) return;
    setCountedStr((expectedAmountCents / 100).toString());
  };

  const handleSubmit = async () => {
    if (isBusy) return;
    if (countedStr === '') {
      setLocalError('Debe ingresar el efectivo contado en caja');
      return;
    }
    if (!confirmedCheckbox) {
      setLocalError('Debe marcar la confirmación de arqueo definitivo');
      return;
    }

    setLocalError(null);
    isSubmittingRef.current = true;
    try {
      const ok = await onConfirmClose(countedAmountCents);
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
      aria-label="Cierre y arqueo de caja"
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
          maxWidth: '520px',
          width: '100%',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg, 18px)', fontWeight: 900, margin: 0 }}>
              Cierre y Arqueo de Caja
            </h2>
            <div
              style={{ fontSize: 'var(--text-xs, 12px)', color: 'var(--color-ink-muted, #666)' }}
            >
              El cierre fijará el saldo definitivo y creará evidencia de auditoría inmutable.
            </div>
          </div>
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

        {localError && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(220, 53, 69, 0.12)',
              color: 'var(--color-danger, #dc3545)',
              border: '1px solid var(--color-danger, #dc3545)',
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

        {/* Expected vs Counted Comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <div
            style={{
              backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.03))',
              border: '1px solid var(--color-border, #ddd)',
              borderRadius: 'var(--radius-xs, 4px)',
              padding: '10px',
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
              Efectivo Esperado
            </div>
            <div
              data-testid="close-expected-amount"
              style={{
                fontFamily: 'monospace, var(--font-mono)',
                fontSize: 'var(--text-xl, 22px)',
                fontWeight: 900,
                color: 'var(--color-ink, #000)',
                marginTop: '4px',
              }}
            >
              {Money.fromCents(expectedAmountCents).format()}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--color-surface, #fff)',
              border: '2px solid var(--color-ink, #000)',
              borderRadius: 'var(--radius-xs, 4px)',
              padding: '10px',
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
              Efectivo Contado
            </div>
            <div
              data-testid="close-counted-amount"
              style={{
                fontFamily: 'monospace, var(--font-mono)',
                fontSize: 'var(--text-xl, 22px)',
                fontWeight: 900,
                color: 'var(--color-ink, #000)',
                marginTop: '4px',
              }}
            >
              {Money.fromCents(countedAmountCents).format()}
            </div>
          </div>
        </div>

        {/* Real-Time Difference Projection */}
        <div
          data-testid="close-difference-badge"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-xs, 4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: isExact
              ? '1px solid #28a745'
              : isSobrante
                ? '1px solid #0056b3'
                : '1px solid #dc3545',
            backgroundColor: isExact
              ? 'rgba(40, 167, 69, 0.12)'
              : isSobrante
                ? 'rgba(0, 86, 179, 0.12)'
                : 'rgba(220, 53, 69, 0.12)',
            color: isExact ? '#1e7e34' : isSobrante ? '#0056b3' : '#bd2130',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {isExact ? <IconCheck size={18} /> : <IconAlert size={18} />}
            <span style={{ fontWeight: 800, fontSize: 'var(--text-sm, 14px)' }}>
              {isExact ? 'ARQUEO EXACTO' : isSobrante ? 'SOBRANTE DE CAJA' : 'FALTANTE DE CAJA'}
            </span>
          </div>
          <div
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-base, 16px)',
              fontWeight: 900,
            }}
          >
            {isExact
              ? '$ 0,00'
              : isSobrante
                ? `+ ${Money.fromCents(differenceCents).format()}`
                : `- ${Money.fromCents(Math.abs(differenceCents)).format()}`}
          </div>
        </div>

        {/* Quick Shortcut: Coincide Exacto */}
        <button
          type="button"
          disabled={isBusy}
          onClick={handleExactShortcut}
          style={{
            padding: '6px 12px',
            fontSize: 'var(--text-xs, 12px)',
            fontWeight: 800,
            backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.05))',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-border, #ccc)',
            borderRadius: 'var(--radius-xs, 4px)',
            cursor: isBusy ? 'not-allowed' : 'pointer',
          }}
        >
          Copiar monto esperado ({Money.fromCents(expectedAmountCents).format()})
        </button>

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
                if (k === 'C') setCountedStr('');
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

        {/* Deliberate Confirmation Checkbox */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: 'var(--text-xs, 12px)',
            fontWeight: 700,
            color: 'var(--color-ink)',
            cursor: 'pointer',
            padding: '4px 0',
          }}
        >
          <input
            type="checkbox"
            data-testid="confirm-close-checkbox"
            checked={confirmedCheckbox}
            onChange={(e) => setConfirmedCheckbox(e.target.checked)}
            disabled={isBusy}
            style={{ width: '16px', height: '16px', cursor: 'pointer' }}
          />
          <span>Confirmo el conteo físico y el cierre definitivo del turno.</span>
        </label>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
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
            VOLVER
          </button>
          <button
            type="button"
            data-testid="submit-close-shift-button"
            disabled={isBusy || !confirmedCheckbox || countedStr === ''}
            onClick={handleSubmit}
            style={{
              flex: 2,
              minHeight: '46px',
              fontSize: 'var(--text-sm, 14px)',
              fontWeight: 900,
              backgroundColor: 'var(--color-brand, #0066cc)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-xs, 4px)',
              cursor: isBusy || !confirmedCheckbox || countedStr === '' ? 'not-allowed' : 'pointer',
            }}
          >
            {isBusy ? 'CERRANDO TURNO...' : 'CONFIRMAR CIERRE'}
          </button>
        </div>
      </div>
    </div>
  );
};
