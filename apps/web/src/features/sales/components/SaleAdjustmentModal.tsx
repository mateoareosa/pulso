import React, { useEffect, useMemo, useState } from 'react';
import type { SaleResponse } from '@pulso/contracts';
import { Money } from '@pulso/domain';

type AdjustmentMode = 'RETURN' | 'VOID';

export interface SaleAdjustmentModalProps {
  sale: SaleResponse;
  mode: AdjustmentMode;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string, items: Array<{ saleItemId: string; quantity: number }>) => void;
}

export const SaleAdjustmentModal: React.FC<SaleAdjustmentModalProps> = ({ sale, mode, isSubmitting, error, onClose, onSubmit }) => {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);
  const isVoid = mode === 'VOID';
  const items = sale.items ?? [];
  const returnedByItem = useMemo(() => {
    const result: Record<string, number> = {};
    for (const adjustment of sale.adjustments ?? []) {
      for (const item of adjustment.items) result[item.saleItemId] = (result[item.saleItemId] ?? 0) + Number(item.quantity);
    }
    return result;
  }, [sale.adjustments]);
  const lineItems = items.map((item) => ({ ...item, remaining: Math.max(0, Number(item.quantity) - (returnedByItem[item.id] ?? 0)) }));
  const selectedItems = lineItems.map((item) => ({ saleItemId: item.id, quantity: Number(quantities[item.id] || 0) })).filter((item) => item.quantity > 0);
  const reasonError = touched && !reason.trim() ? 'Ingresá un motivo.' : null;
  const quantityError = !isVoid && touched && selectedItems.length === 0 ? 'Seleccioná al menos una cantidad.' : null;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !isSubmitting) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSubmitting, onClose]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!reason.trim() || (!isVoid && selectedItems.length === 0)) return;
    onSubmit(reason.trim(), isVoid ? [] : selectedItems);
  };

  return (
    <div role="presentation" className="ticket-ledger-modal sale-adjustment-modal" style={{ zIndex: 1100 }} onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="sale-adjustment-title" aria-describedby="sale-adjustment-description" className="ticket-ledger-modal__content sale-adjustment-modal__content">
        <header className="sale-adjustment-modal__header">
          <div><p className="sale-adjustment-modal__eyebrow">AJUSTE DE VENTA / {isVoid ? '02' : '01'}</p><h2 id="sale-adjustment-title">{isVoid ? 'Anular venta' : 'Devolver artículos'}</h2></div>
          <button ref={closeButtonRef} type="button" className="sale-adjustment-modal__close" aria-label="Cerrar ajuste" onClick={onClose} disabled={isSubmitting}>×</button>
        </header>
        <div className="sale-adjustment-modal__meta" id="sale-adjustment-description"><span>COMPROBANTE</span><strong className="font-tabular">{sale.id}</strong><span className="sale-adjustment-modal__meta-separator" aria-hidden="true">·</span><span>REPOSICIÓN DE STOCK ACTIVA</span></div>
        <p className="sale-adjustment-modal__note">Los reintegros no efectivos quedan pendientes de gestión manual.</p>
        <form onSubmit={submit} noValidate>
          {!isVoid && <fieldset className="sale-adjustment-modal__fieldset"><legend><span>Artículos a devolver</span><small>Indicá unidades</small></legend><div className="sale-adjustment-modal__table" role="table" aria-label="Artículos de la venta"><div className="sale-adjustment-modal__table-head" role="row"><span role="columnheader">Artículo</span><span role="columnheader">Precio</span><span role="columnheader">Cantidad</span></div>{lineItems.map((item) => <label key={item.id} className={`sale-adjustment-modal__row${item.remaining <= 0 ? ' is-exhausted' : ''}`}><span className="sale-adjustment-modal__item" role="cell"><strong>{item.name}</strong><small>{item.remaining > 0 ? `${item.remaining} disponibles` : 'Sin unidades disponibles'}</small></span><span className="sale-adjustment-modal__price font-tabular" role="cell">{Money.fromCents(item.unitPriceCents).format()}</span><span role="cell"><input className="sale-adjustment-modal__quantity font-tabular" aria-label={`Cantidad a devolver de ${item.name}`} type="number" min="0" max={item.remaining} step="any" value={quantities[item.id] ?? ''} disabled={item.remaining <= 0 || isSubmitting} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} /></span></label>)}</div>{quantityError && <p className="sale-adjustment-modal__error" role="alert">{quantityError}</p>}</fieldset>}
          {isVoid && <div className="sale-adjustment-modal__warning" role="status"><span className="sale-adjustment-modal__warning-mark" aria-hidden="true">!</span><div><strong>Se anulará la venta completa</strong><span className="font-tabular">{Money.fromCents(sale.totalCents).format()}</span></div></div>}
          <label className="sale-adjustment-modal__reason"><span>Motivo <small>(obligatorio)</small></span><textarea aria-label="Motivo del ajuste" required minLength={1} rows={3} value={reason} disabled={isSubmitting} onChange={(event) => setReason(event.target.value)} placeholder="Describí brevemente por qué se realiza este ajuste" /></label>
          {reasonError && <p className="sale-adjustment-modal__error" role="alert">{reasonError}</p>}{error && <p className="sale-adjustment-modal__error sale-adjustment-modal__error--server" role="alert">{error}</p>}
          <footer className="sale-adjustment-modal__footer"><span className="sale-adjustment-modal__shortcut"><kbd>ESC</kbd> cerrar</span><div className="sale-adjustment-modal__actions"><button type="button" className="pulso-button pulso-button--ghost" onClick={onClose} disabled={isSubmitting}>Cancelar</button><button type="submit" className={`pulso-button ${isVoid ? 'pulso-button--danger' : 'pulso-button--primary'}`} disabled={isSubmitting}>{isSubmitting ? 'Procesando…' : isVoid ? 'Anular venta' : 'Confirmar devolución'}</button></div></footer>
        </form>
      </section>
    </div>
  );
};
