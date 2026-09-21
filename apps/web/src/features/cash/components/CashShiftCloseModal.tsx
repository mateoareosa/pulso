import React, { useEffect, useRef, useState } from 'react';
import { Money } from '@pulso/domain';
import { IconAlert, IconCheck, IconClose } from '@pulso/icons';

interface CashShiftCloseModalProps {
  expectedAmountCents: number;
  breakdown: {
    openingAmountCents: number;
    cashSalesAmountCents: number;
    purchaseAmountCents: number;
    cashInAmountCents: number;
    cashOutAmountCents: number;
    refundAmountCents: number;
  };
  isSubmitting: boolean;
  onConfirmClose: (countedAmountCents: number, motivo?: string) => Promise<boolean>;
  onClose: () => void;
}

export const CashShiftCloseModal: React.FC<CashShiftCloseModalProps> = ({
  expectedAmountCents,
  breakdown,
  isSubmitting,
  onConfirmClose,
  onClose,
}) => {
  const [countedStr, setCountedStr] = useState('');
  const [confirmedCheckbox, setConfirmedCheckbox] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isBusy = isSubmitting || isSubmittingRef.current;

  const normalizedInput = countedStr.replace(',', '.');
  const [wholePart = '0', decimalPart = ''] = normalizedInput.split('.');
  const countedAmountCents = normalizedInput
    ? Number(wholePart || '0') * 100 + Number(decimalPart.padEnd(2, '0').slice(0, 2))
    : 0;
  const differenceCents = countedAmountCents - expectedAmountCents;
  const isExact = differenceCents === 0;
  const isSobrante = differenceCents > 0;
  const motivoNormalizado = motivo.trim();
  const motivoValido = isExact || motivoNormalizado.length >= 3;
  const differenceState = isExact ? 'exact' : isSobrante ? 'over' : 'short';

  const handleAppend = (char: string) => {
    if (isBusy) return;
    setCountedStr((prev) => {
      if (char === '.' || char === ',') {
        if (prev.includes('.') || prev.includes(',')) return prev;
        return prev ? `${prev}.` : '0.';
      }
      const dotIdx = prev.indexOf('.');
      if (dotIdx !== -1 && prev.length - dotIdx > 2) return prev;
      if (prev === '0') return char === '0' || char === '00' ? '0' : char;
      if (char === '00') {
        if (!prev) return '0';
        if (dotIdx !== -1 && 2 - (prev.length - dotIdx - 1) < 2) return prev;
      }
      return `${prev}${char}`;
    });
  };
  const handleBackspace = () => { if (!isBusy) setCountedStr((prev) => (prev.length > 1 ? prev.slice(0, -1) : '')); };
  const handleSubmit = async () => {
    if (isBusy) return;
    if (countedStr === '') return setLocalError('Debe ingresar el efectivo contado en caja');
    if (!confirmedCheckbox) return setLocalError('Debe confirmar el cierre definitivo');
    if (!motivoValido) return setLocalError(isSobrante ? 'Debe ingresar el motivo del sobrante' : 'Debe ingresar el motivo del faltante');
    setLocalError(null);
    isSubmittingRef.current = true;
    try {
      const ok = await onConfirmClose(countedAmountCents, isExact ? undefined : motivoNormalizado);
      if (ok) onClose();
    } finally { isSubmittingRef.current = false; }
  };

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isBusy, onClose]);

  return (
    <div className="cash-close-modal__overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isBusy) onClose(); }}>
      <section className="cash-close-modal" role="dialog" aria-modal="true" aria-labelledby="cash-close-title" aria-describedby="cash-close-description">
        <header className="cash-close-modal__header">
          <div><h2 id="cash-close-title" className="cash-close-modal__title">Cerrar caja</h2><p id="cash-close-description" className="cash-close-modal__subtitle">Contá el efectivo físico y comparalo con los movimientos registrados.</p></div>
          <button ref={closeButtonRef} type="button" className="pulso-button pulso-button--ghost cash-close-modal__close" aria-label="Cerrar ventana" onClick={onClose} disabled={isBusy}><IconClose size={20} /></button>
        </header>

        <div data-testid="close-breakdown" className="cash-close-modal__summary" aria-label="Desglose del efectivo esperado">
          <div className="cash-close-modal__amount"><div className="cash-close-modal__label">Apertura</div><div className="font-tabular">{Money.fromCents(breakdown.openingAmountCents).format()}</div></div>
          <div className="cash-close-modal__amount"><div className="cash-close-modal__label">Ventas</div><div className="font-tabular">+ {Money.fromCents(breakdown.cashSalesAmountCents).format()}</div></div>
          <div className="cash-close-modal__amount"><div className="cash-close-modal__label">Compras</div><div className="font-tabular">- {Money.fromCents(breakdown.purchaseAmountCents).format()}</div></div>
          <div className="cash-close-modal__amount"><div className="cash-close-modal__label">Ingresos</div><div className="font-tabular">+ {Money.fromCents(breakdown.cashInAmountCents).format()}</div></div>
          <div className="cash-close-modal__amount"><div className="cash-close-modal__label">Retiros</div><div className="font-tabular">- {Money.fromCents(breakdown.cashOutAmountCents).format()}</div></div>
          <div className="cash-close-modal__amount"><div className="cash-close-modal__label">Devoluciones</div><div className="font-tabular">- {Money.fromCents(breakdown.refundAmountCents).format()}</div></div>
          <div className="cash-close-modal__amount"><div className="cash-close-modal__label">Esperado</div><div data-testid="close-expected-amount" className="cash-close-modal__value font-tabular">{Money.fromCents(expectedAmountCents).format()}</div></div>
          <div className="cash-close-modal__amount cash-close-modal__amount--counted"><div className="cash-close-modal__label">Contado</div><div data-testid="close-counted-amount" className="cash-close-modal__value font-tabular">{Money.fromCents(countedAmountCents).format()}</div></div>
        </div>

        <div data-testid="close-difference-badge" className={`cash-close-modal__difference cash-close-modal__difference--${differenceState}`} role="status">
          <span>{isExact ? <IconCheck size={18} /> : <IconAlert size={18} />} {isExact ? 'SIN DIFERENCIA' : isSobrante ? 'SOBRANTE DE CAJA' : 'FALTANTE DE CAJA'}</span>
          <strong className="cash-close-modal__difference-value font-tabular">{isExact ? '$ 0,00' : `${isSobrante ? '+' : '-'} ${Money.fromCents(Math.abs(differenceCents)).format()}`}</strong>
        </div>

        {!isExact && <label className="cash-close-modal__reason"><span>{isSobrante ? 'Motivo del sobrante' : 'Motivo del faltante'}</span><textarea className="pulso-input" aria-label={isSobrante ? 'Motivo del sobrante' : 'Motivo del faltante'} value={motivo} maxLength={255} disabled={isBusy} onChange={(event) => setMotivo(event.target.value)} placeholder="Describí qué ocurrió" rows={3} /><span className="cash-close-modal__hint">Obligatorio para dejar constancia de la diferencia.</span></label>}
        {localError && <div className="cash-close-modal__error" role="alert"><IconAlert size={16} /><span>{localError}</span></div>}

        <div className="cash-close-modal__keypad" aria-label="Teclado para ingresar efectivo">
          {['1','2','3','4','5','6','7','8','9',',','0','⌫'].map((key) => <button key={key} type="button" className="pulso-button pulso-button--secondary cash-close-modal__key" disabled={isBusy} aria-label={key === '⌫' ? 'Borrar' : key} onClick={() => key === '⌫' ? handleBackspace() : handleAppend(key)}>{key}</button>)}
        </div>
        <label className="cash-close-modal__confirm"><input type="checkbox" data-testid="confirm-close-checkbox" checked={confirmedCheckbox} onChange={(event) => setConfirmedCheckbox(event.target.checked)} disabled={isBusy} /><span>Confirmo el conteo físico y el cierre definitivo de caja.</span></label>
        <footer className="cash-close-modal__actions"><button type="button" className="pulso-button pulso-button--ghost pulso-button--lg" disabled={isBusy} onClick={onClose}>Volver</button><button type="button" data-testid="submit-close-shift-button" className="pulso-button pulso-button--primary pulso-button--lg" disabled={isBusy || !confirmedCheckbox || countedStr === '' || !motivoValido} onClick={handleSubmit}>{isBusy ? 'Cerrando turno…' : 'Confirmar cierre'}</button></footer>
      </section>
    </div>
  );
};
