import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Money } from '@pulso/domain';
import { IconAlert } from '@pulso/icons';

interface CashShiftOpenViewProps {
  onOpenShift: (amountCents: number) => Promise<boolean>;
  isSubmitting: boolean;
  isOffline: boolean;
  error: string | null;
}

export const CashShiftOpenView: React.FC<CashShiftOpenViewProps> = ({
  onOpenShift,
  isSubmitting,
  isOffline,
  error,
}) => {
  const [amountStr, setAmountStr] = useState<string>('0');
  const isSubmittingRef = useRef(false);

  const normalizedInput = amountStr.replace(',', '.');
  const amountCents = normalizedInput
    ? Math.max(0, Math.round(parseFloat(normalizedInput) * 100))
    : 0;
  const isBusy = isSubmitting || isSubmittingRef.current;

  const handleAppend = useCallback(
    (char: string) => {
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
    },
    [isBusy]
  );

  const handleBackspace = useCallback(() => {
    if (isBusy) return;
    setAmountStr((prev) => (prev.length > 1 ? prev.slice(0, -1) : '0'));
  }, [isBusy]);

  const handleClear = useCallback(() => {
    if (isBusy) return;
    setAmountStr('0');
  }, [isBusy]);

  const handleQuickAmount = (cents: number) => {
    if (isBusy) return;
    setAmountStr((cents / 100).toString());
  };

  const handleSubmit = useCallback(async () => {
    if (isBusy || isOffline) return;
    isSubmittingRef.current = true;
    try {
      await onOpenShift(amountCents);
    } finally {
      isSubmittingRef.current = false;
    }
  }, [isBusy, isOffline, onOpenShift, amountCents]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isBusy) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleAppend(e.key);
      } else if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        handleAppend(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBusy, handleAppend, handleBackspace, handleClear, handleSubmit]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        maxWidth: '540px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.03))',
          border: '1px solid var(--color-border, rgba(0,0,0,0.15))',
          borderRadius: 'var(--radius-md, 8px)',
          padding: '24px',
          width: '100%',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <span
            style={{
              display: 'inline-block',
              padding: '4px 10px',
              borderRadius: 'var(--radius-xs, 4px)',
              backgroundColor: 'rgba(108, 117, 125, 0.15)',
              color: 'var(--color-ink-muted, #6c757d)',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: '8px',
            }}
          >
            Estado de Caja
          </span>
          <h2 style={{ fontSize: 'var(--text-xl, 24px)', fontWeight: 900, margin: '4px 0' }}>
            SIN TURNO ABIERTO
          </h2>
          <p
            style={{
              fontSize: 'var(--text-sm, 14px)',
              color: 'var(--color-ink-muted, #6c757d)',
              margin: '6px 0 0',
              lineHeight: 1.4,
            }}
          >
            Para operar el mostrador y registrar cobros en efectivo, abra un nuevo turno indicando
            el fondo inicial de caja.
          </p>
        </div>

        {isOffline && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#fff3cd',
              color: '#856404',
              border: '1px solid #ffeeba',
              borderRadius: 'var(--radius-xs, 4px)',
              padding: '10px 14px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 700,
              marginBottom: '16px',
            }}
          >
            <IconAlert size={16} />
            <span>Sin conexión. La apertura de turno requiere comunicación con el servidor.</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            style={{
              backgroundColor: 'rgba(220, 53, 69, 0.12)',
              color: 'var(--color-danger-solid)',
              border: '1px solid var(--color-danger-solid)',
              borderRadius: 'var(--radius-xs, 4px)',
              padding: '10px 14px',
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 700,
              marginBottom: '16px',
            }}
          >
            {error}
          </div>
        )}

        {/* Display Monto Inicial */}
        <div
          style={{
            backgroundColor: 'var(--color-surface, #fff)',
            border: '2px solid var(--color-ink, #000)',
            borderRadius: 'var(--radius-xs, 4px)',
            padding: '12px 16px',
            marginBottom: '16px',
            textAlign: 'right',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs, 12px)',
              fontWeight: 700,
              color: 'var(--color-ink-muted, #6c757d)',
              textTransform: 'uppercase',
              marginBottom: '2px',
            }}
          >
            Fondo Inicial de Caja
          </div>
          <div
            data-testid="opening-amount-display"
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontSize: 'var(--text-2xl, 32px)',
              fontWeight: 900,
              color: 'var(--color-ink, #000)',
              letterSpacing: '-0.02em',
            }}
          >
            {Money.fromCents(amountCents).format()}
          </div>
        </div>

        {/* Quick Amount Shortcuts */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '6px',
            marginBottom: '14px',
          }}
        >
          {[
            { label: '$0', cents: 0 },
            { label: '$5.000', cents: 500000 },
            { label: '$10.000', cents: 1000000 },
            { label: '$20.000', cents: 2000000 },
          ].map((btn) => (
            <button
              key={btn.label}
              type="button"
              disabled={isBusy}
              onClick={() => handleQuickAmount(btn.cents)}
              style={{
                padding: '6px 4px',
                fontSize: 'var(--text-xs, 12px)',
                fontWeight: 800,
                backgroundColor: 'var(--color-surface, #fff)',
                border: '1px solid var(--color-border, #ccc)',
                borderRadius: 'var(--radius-xs, 4px)',
                color: 'var(--color-ink)',
                cursor: isBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Tactile Keypad */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px',
            marginBottom: '18px',
          }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '00'].map((k) => (
            <button
              key={k}
              type="button"
              disabled={isBusy}
              onClick={() => {
                if (k === 'C') handleClear();
                else handleAppend(k);
              }}
              style={{
                minHeight: '48px',
                fontSize: 'var(--text-lg, 18px)',
                fontWeight: 800,
                backgroundColor:
                  k === 'C' ? 'rgba(220, 53, 69, 0.08)' : 'var(--color-surface, #fff)',
                color: k === 'C' ? 'var(--color-danger-solid)' : 'var(--color-ink, #000)',
                border: '1px solid var(--color-border, #ccc)',
                borderRadius: 'var(--radius-xs, 4px)',
                cursor: isBusy ? 'not-allowed' : 'pointer',
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Submit Button */}
        <button
          type="button"
          disabled={isBusy || isOffline}
          onClick={handleSubmit}
          aria-disabled={isBusy || isOffline}
          data-testid="open-shift-button"
          style={{
            width: '100%',
            minHeight: '52px',
            fontSize: 'var(--text-base, 16px)',
            fontWeight: 900,
            backgroundColor: isOffline ? '#aaa' : 'var(--color-brand, #0066cc)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-xs, 4px)',
            cursor: isBusy || isOffline ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          {isBusy ? 'ABRIENDO CAJA...' : 'ABRIR CAJA'}
        </button>
      </div>
    </div>
  );
};
