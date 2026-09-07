import React from 'react';
import { Money } from '@pulso/domain';
import type { CashShiftResponse } from '@pulso/contracts';
import { IconCheck, IconAlert } from '@pulso/icons';

interface CashShiftClosedSummaryViewProps {
  shift: CashShiftResponse;
  onOpenNewShift: () => void;
}

export const CashShiftClosedSummaryView: React.FC<CashShiftClosedSummaryViewProps> = ({
  shift,
  onOpenNewShift,
}) => {
  const summary = shift.summary || {
    openingAmountCents: shift.openingAmountCents,
    cashSalesAmountCents: 0,
    cashInAmountCents: 0,
    cashOutAmountCents: 0,
    expectedAmountCents: shift.expectedAmountCents ?? shift.openingAmountCents,
    movementsCount: 0,
    salesCount: 0,
  };

  const expectedCents = shift.expectedAmountCents ?? summary.expectedAmountCents;
  const countedCents = shift.countedAmountCents ?? 0;
  const diffCents = shift.differenceAmountCents ?? 0;

  const isExact = diffCents === 0;
  const isSobrante = diffCents > 0;

  const closedDate = shift.closedAtUtc ? new Date(shift.closedAtUtc) : new Date();
  const closedFormatted = `${closedDate.toLocaleDateString('es-AR')} ${closedDate.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`;
  const closedByName = shift.closedByUser?.name || 'Operador';

  return (
    <div
      style={{
        maxWidth: '600px',
        margin: '32px auto',
        padding: '24px',
        backgroundColor: 'var(--color-surface, #fff)',
        border: '1px solid var(--color-border, #ddd)',
        borderRadius: 'var(--radius-md, 8px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(40, 167, 69, 0.15)',
            color: 'var(--color-success, #28a745)',
            marginBottom: '12px',
          }}
        >
          <IconCheck size={28} />
        </div>
        <h2 style={{ fontSize: 'var(--text-xl, 24px)', fontWeight: 900, margin: 0 }}>
          Turno de Caja Cerrado
        </h2>
        <div
          style={{
            fontSize: 'var(--text-xs, 12px)',
            color: 'var(--color-ink-muted, #666)',
            marginTop: '4px',
          }}
        >
          Cerrado por <strong>{closedByName}</strong> el {closedFormatted}
        </div>
      </div>

      {/* Arqueo Result Badge */}
      <div
        data-testid="shift-closed-difference-banner"
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius-xs, 4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
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
            {isExact
              ? 'RESULTADO: ARQUEO EXACTO'
              : isSobrante
                ? 'RESULTADO: SOBRANTE DE CAJA'
                : 'RESULTADO: FALTANTE DE CAJA'}
          </span>
        </div>
        <span
          style={{
            fontFamily: 'monospace, var(--font-mono)',
            fontSize: 'var(--text-base, 16px)',
            fontWeight: 900,
          }}
        >
          {isExact
            ? '$ 0,00'
            : isSobrante
              ? `+ ${Money.fromCents(diffCents).format()}`
              : `- ${Money.fromCents(Math.abs(diffCents)).format()}`}
        </span>
      </div>

      {/* Breakdown Ledger Table */}
      <div
        style={{
          backgroundColor: 'var(--color-surface-raised, rgba(0,0,0,0.02))',
          border: '1px solid var(--color-border, #eee)',
          borderRadius: 'var(--radius-xs, 4px)',
          padding: '12px 16px',
          marginBottom: '24px',
          fontSize: 'var(--text-sm, 14px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--color-ink-muted, #666)' }}>Fondo Inicial:</span>
          <span style={{ fontFamily: 'monospace, var(--font-mono)', fontWeight: 700 }}>
            {Money.fromCents(shift.openingAmountCents).format()}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--color-ink-muted, #666)' }}>
            Ventas en Efectivo ({summary.salesCount}):
          </span>
          <span
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontWeight: 700,
              color: 'var(--color-success, #28a745)',
            }}
          >
            + {Money.fromCents(summary.cashSalesAmountCents).format()}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--color-ink-muted, #666)' }}>Ingresos Manuales:</span>
          <span
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontWeight: 700,
              color: 'var(--color-brand, #0066cc)',
            }}
          >
            + {Money.fromCents(summary.cashInAmountCents).format()}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--color-ink-muted, #666)' }}>Retiros Manuales:</span>
          <span
            style={{
              fontFamily: 'monospace, var(--font-mono)',
              fontWeight: 700,
              color: 'var(--color-danger, #dc3545)',
            }}
          >
            - {Money.fromCents(summary.cashOutAmountCents).format()}
          </span>
        </div>

        <div
          style={{ height: '1px', backgroundColor: 'var(--color-border, #ddd)', margin: '4px 0' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800 }}>Efectivo Esperado:</span>
          <span style={{ fontFamily: 'monospace, var(--font-mono)', fontWeight: 900 }}>
            {Money.fromCents(expectedCents).format()}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 800 }}>Efectivo Contado:</span>
          <span style={{ fontFamily: 'monospace, var(--font-mono)', fontWeight: 900 }}>
            {Money.fromCents(countedCents).format()}
          </span>
        </div>
      </div>

      <button
        type="button"
        data-testid="start-new-shift-button"
        onClick={onOpenNewShift}
        style={{
          width: '100%',
          minHeight: '48px',
          fontSize: 'var(--text-base, 15px)',
          fontWeight: 900,
          backgroundColor: 'var(--color-brand, #0066cc)',
          color: '#fff',
          border: 'none',
          borderRadius: 'var(--radius-xs, 4px)',
          cursor: 'pointer',
          letterSpacing: '0.04em',
        }}
      >
        ABRIR NUEVO TURNO DE CAJA
      </button>
    </div>
  );
};
