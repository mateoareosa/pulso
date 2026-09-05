import React, { useState, useEffect } from 'react';
import { Money } from '@pulso/domain';
import { IconCheck } from '@pulso/icons';

export interface MoneyKeypadProps {
  totalCents: number;
  onConfirmTender: (data: { receivedCents: number; changeCents: number }) => void;
  onCancel: () => void;
  currencySymbol?: string;
}

export const MoneyKeypad: React.FC<MoneyKeypadProps> = ({
  totalCents,
  onConfirmTender,
  onCancel,
  currencySymbol = '$',
}) => {
  const [receivedInput, setReceivedInput] = useState<string>('');

  const receivedCents = receivedInput ? Math.round(parseFloat(receivedInput) * 100) : 0;
  const changeCents = Math.max(0, receivedCents - totalCents);
  const isSufficient = receivedCents >= totalCents;

  const totalMoney = Money.fromCents(totalCents);
  const changeMoney = Money.fromCents(changeCents);

  // Keyboard navigation inside the tender modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        if (isSufficient) {
          e.preventDefault();
          onConfirmTender({ receivedCents, changeCents });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSufficient, receivedCents, changeCents, onCancel, onConfirmTender]);

  const handleDigit = (digit: string) => {
    setReceivedInput((prev) => {
      if (digit === '.' && prev.includes('.')) return prev;
      return prev + digit;
    });
  };

  const handleClear = () => {
    setReceivedInput('');
  };

  const handleQuickAdd = (amount: number) => {
    const currentDecimal = receivedInput ? parseFloat(receivedInput) : 0;
    const nextVal = currentDecimal + amount;
    setReceivedInput(nextVal.toString());
  };

  const handleExact = () => {
    setReceivedInput(totalMoney.toDecimal().toString());
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cobro en efectivo"
      style={{
        backgroundColor: 'var(--color-surface)',
        color: 'var(--color-ink)',
        border: '3px solid var(--color-ink)',
        padding: '24px',
        maxWidth: '460px',
        width: '100%',
        boxShadow: 'var(--shadow-modal)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {/* Header with Amount to Collect */}
      <div
        style={{
          borderBottom: '2px solid var(--color-ink)',
          paddingBottom: '14px',
          marginBottom: '16px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 'var(--text-xs)',
            fontWeight: 800,
            letterSpacing: '1px',
            color: 'var(--color-ink-muted)',
            textTransform: 'uppercase',
          }}
        >
          TOTAL A COBRAR
        </div>
        <div
          style={{
            fontSize: 'var(--text-3xl)',
            fontWeight: 800,
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-ink)',
            letterSpacing: '-0.5px',
            marginTop: '4px',
          }}
        >
          {totalMoney.format()}
        </div>
      </div>

      {/* Input Display: Received and Change */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--color-ticket)',
            border: '2px solid var(--color-ink)',
            padding: '10px 14px',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: 'var(--color-ink-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Efectivo Recibido
          </div>
          <div
            style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              marginTop: '4px',
            }}
          >
            {currencySymbol} {receivedInput || '0'}
          </div>
        </div>

        <div
          style={{
            backgroundColor: isSufficient
              ? 'var(--color-pulse-soft)'
              : 'var(--color-surface-sunken)',
            border: `2px solid ${isSufficient ? 'var(--color-pulse-border)' : 'var(--color-border)'}`,
            padding: '10px 14px',
            transition: 'background-color var(--duration-fast) ease',
          }}
        >
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 700,
              color: isSufficient ? 'var(--color-ink)' : 'var(--color-ink-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Vuelto
          </div>
          <div
            style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              color: isSufficient ? 'var(--color-ink)' : 'var(--color-ink-subtle)',
              marginTop: '4px',
            }}
          >
            {changeMoney.format()}
          </div>
        </div>
      </div>

      {/* Quick Cash Buttons */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '8px',
          marginBottom: '14px',
        }}
      >
        <button
          type="button"
          onClick={handleExact}
          style={{
            backgroundColor: 'var(--color-ink)',
            color: 'var(--color-ticket)',
            border: 'none',
            padding: '10px 4px',
            fontWeight: 800,
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            minHeight: '40px',
            boxShadow: 'var(--shadow-key)',
          }}
        >
          EXACTO
        </button>
        <button
          type="button"
          onClick={() => handleQuickAdd(1000)}
          style={{
            backgroundColor: 'var(--color-surface-sunken)',
            border: '1px solid var(--color-ink)',
            padding: '10px 4px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            minHeight: '40px',
            boxShadow: 'var(--shadow-key)',
          }}
        >
          +$1.000
        </button>
        <button
          type="button"
          onClick={() => handleQuickAdd(2000)}
          style={{
            backgroundColor: 'var(--color-surface-sunken)',
            border: '1px solid var(--color-ink)',
            padding: '10px 4px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            minHeight: '40px',
            boxShadow: 'var(--shadow-key)',
          }}
        >
          +$2.000
        </button>
        <button
          type="button"
          onClick={() => handleQuickAdd(5000)}
          style={{
            backgroundColor: 'var(--color-surface-sunken)',
            border: '1px solid var(--color-ink)',
            padding: '10px 4px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
            minHeight: '40px',
            boxShadow: 'var(--shadow-key)',
          }}
        >
          +$5.000
        </button>
      </div>

      {/* Numeric Keypad Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginBottom: '18px',
        }}
      >
        {['7', '8', '9', '4', '5', '6', '1', '2', '3', '0', '00', 'C'].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => (k === 'C' ? handleClear() : handleDigit(k))}
            style={{
              height: '46px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-lg)',
              fontWeight: 700,
              backgroundColor: k === 'C' ? 'var(--color-tomato-soft)' : 'var(--color-surface)',
              color: k === 'C' ? 'var(--color-tomato-solid)' : 'var(--color-ink)',
              border: '2px solid var(--color-ink)',
              boxShadow: 'var(--shadow-key)',
              cursor: 'pointer',
            }}
          >
            {k}
          </button>
        ))}
      </div>

      {/* Actions: Cancel or Confirm */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            height: '48px',
            backgroundColor: 'var(--color-surface)',
            color: 'var(--color-ink)',
            border: '2px solid var(--color-ink)',
            fontWeight: 700,
            fontSize: 'var(--text-sm)',
            cursor: 'pointer',
          }}
        >
          CANCELAR (ESC)
        </button>

        <button
          type="button"
          disabled={!isSufficient}
          onClick={() => onConfirmTender({ receivedCents, changeCents })}
          style={{
            height: '48px',
            backgroundColor: isSufficient
              ? 'var(--color-pulse-solid)'
              : 'var(--color-surface-sunken)',
            color: isSufficient ? '#0f172a' : 'var(--color-ink-subtle)',
            border: '2px solid var(--color-ink)',
            fontWeight: 900,
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: isSufficient ? 'pointer' : 'not-allowed',
            letterSpacing: '0.5px',
            boxShadow: isSufficient ? 'var(--shadow-key)' : 'none',
          }}
        >
          <IconCheck size={18} />
          <span>CONFIRMAR COBRO (ENTER)</span>
        </button>
      </div>
    </div>
  );
};
