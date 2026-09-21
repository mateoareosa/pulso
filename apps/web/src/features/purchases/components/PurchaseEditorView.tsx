import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePurchasesStore } from '../store/purchases.store';
import { useCatalogStore } from '../../catalog/store/catalog.store';
import { useCashStore } from '../../cash/store/cash.store';
import { Money } from '@pulso/domain';
import type {
  PurchasePaymentSource,
  PurchaseItemLine,
  PurchaseDetailResponse,
} from '@pulso/contracts';

interface PurchaseEditorViewProps {
  context: { tenantId: string; locationId: string };
  isOffline: boolean;
  onDone: () => void;
  existingDraft?: PurchaseDetailResponse | null;
  mode?: 'create' | 'resume';
}

interface DraftLineItem {
  productId: string;
  productName: string;
  barcode?: string | null;
  currentStock: number;
  currentCostCents?: number | null;
  salePriceCents: number;
  quantity: number;
  unitCostCents: number;
  notes?: string;
}

type PurchaseContext = PurchaseEditorViewProps['context'];

interface DirectReceiptIntent {
  draftId: string;
  draftVersion: number;
  receipt: {
    idempotencyKey: string;
    paymentSource: PurchasePaymentSource;
  };
  context: PurchaseContext;
}

const STALE_CONTEXT_MESSAGE =
  'La sesión de trabajo cambió. Volvé al listado y cargá la compra en la sucursal actual.';

const purchaseContextKey = (context: PurchaseContext) =>
  `${context.tenantId}::${context.locationId}`;

export const PurchaseEditorView: React.FC<PurchaseEditorViewProps> = ({
  context,
  isOffline,
  onDone,
  existingDraft = null,
  mode = existingDraft ? 'resume' : 'create',
}) => {
  const {
    suppliers,
    isSubmitting,
    actionError,
    createDraft,
    updateDraft,
    receivePurchase,
    clearActionError,
  } = usePurchasesStore();

  const { products } = useCatalogStore();
  const { activeShift } = useCashStore();

  const [supplierId, setSupplierId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [discountAmount, setDiscountAmount] = useState('');
  const [additionalCostAmount, setAdditionalCostAmount] = useState('');
  const [paymentSource, setPaymentSource] = useState<PurchasePaymentSource>('OUTSIDE_CASH');
  const [notes, setNotes] = useState('');

  // Item selector state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [itemUnitCost, setItemUnitCost] = useState('');
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pendingDirectReceipt, setPendingDirectReceipt] = useState<DirectReceiptIntent | null>(
    null
  );
  const [isReceivingDirect, setIsReceivingDirect] = useState(false);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const invoiceInputRef = useRef<HTMLInputElement>(null);
  const directReceiptInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const currentContextKey = purchaseContextKey(context);
  const latestContextKeyRef = useRef(currentContextKey);
  const previousContextKeyRef = useRef(currentContextKey);
  const contextStaleRef = useRef(false);
  latestContextKeyRef.current = currentContextKey;

  useEffect(() => {
    if (previousContextKeyRef.current !== currentContextKey) {
      setSupplierId('');
      setDocumentNumber('');
      setDiscountAmount('');
      setAdditionalCostAmount('');
      setPaymentSource('OUTSIDE_CASH');
      setNotes('');
      setLineItems([]);
      setPendingDirectReceipt(null);
      setValidationError(STALE_CONTEXT_MESSAGE);
      setHydratedKey(null);
      contextStaleRef.current = true;
      previousContextKeyRef.current = currentContextKey;
    }
  }, [currentContextKey]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Filter only active suppliers
  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.isActive), [suppliers]);

  const draftKey = existingDraft
    ? `${existingDraft.id}:${existingDraft.version}:${currentContextKey}`
    : null;
  const isDraftInCurrentContext =
    !existingDraft ||
    (existingDraft.tenantId === context.tenantId &&
      existingDraft.locationId === context.locationId);
  useEffect(() => {
    if (!existingDraft || mode !== 'resume' || !isDraftInCurrentContext || draftKey === hydratedKey)
      return;
    setSupplierId(existingDraft.supplierId);
    setDocumentNumber(existingDraft.documentNumber ?? '');
    setDiscountAmount((existingDraft.discountCents / 100).toFixed(2));
    setAdditionalCostAmount((existingDraft.additionalCostCents / 100).toFixed(2));
    setPaymentSource(existingDraft.paymentSource);
    setNotes(existingDraft.notes ?? '');
    setLineItems(
      existingDraft.items.map((item) => ({
        productId: item.productId,
        productName: item.productNameSnapshot,
        barcode: item.barcodeSnapshot,
        currentStock: Number(item.currentStock ?? 0),
        currentCostCents: item.lastCostCents,
        salePriceCents: item.salePriceCents ?? 0,
        quantity: item.quantity,
        unitCostCents: item.unitCostCents,
      }))
    );
    setHydratedKey(draftKey);
    setValidationError(null);
    invoiceInputRef.current?.focus();
  }, [draftKey, existingDraft, hydratedKey, isDraftInCurrentContext, mode]);

  useEffect(() => {
    if (mode === 'create' && !existingDraft) invoiceInputRef.current?.focus();
  }, [existingDraft, mode]);

  // Selected product metadata for quick auto-fill
  const selectedCatalogProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
    const prod = products.find((p) => p.id === productId);
    if (prod) {
      if (prod.costPriceCents) {
        setItemUnitCost((prod.costPriceCents / 100).toFixed(2));
      } else {
        setItemUnitCost('');
      }
    }
  };

  const handleAddLineItem = () => {
    setValidationError(null);
    clearActionError();

    if (!selectedProductId) {
      setValidationError('Seleccioná un producto para agregar.');
      return;
    }

    const qty = Number(itemQuantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      setValidationError('La cantidad debe ser un número entero mayor a 0.');
      return;
    }

    const costDecimal = parseFloat(itemUnitCost);
    if (isNaN(costDecimal) || costDecimal < 0) {
      setValidationError('El costo unitario debe ser mayor o igual a 0.');
      return;
    }
    const unitCostCents = Math.round(costDecimal * 100);

    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const parsedStock = parseInt(prod.stockQuantity, 10) || 0;

    // Check if product already in items
    const existingIndex = lineItems.findIndex((item) => item.productId === selectedProductId);
    if (existingIndex >= 0 && lineItems[existingIndex]) {
      const updated = [...lineItems];
      const existing = updated[existingIndex]!;
      updated[existingIndex] = {
        ...existing,
        quantity: existing.quantity + qty,
        unitCostCents,
      };
      setLineItems(updated);
    } else {
      setLineItems([
        ...lineItems,
        {
          productId: prod.id,
          productName: prod.name,
          barcode: prod.barcode,
          currentStock: parsedStock,
          currentCostCents: prod.costPriceCents,
          salePriceCents: prod.salePriceCents,
          quantity: qty,
          unitCostCents,
        },
      ]);
    }

    // Reset line inputs
    setSelectedProductId('');
    setItemQuantity('1');
    setItemUnitCost('');
  };

  const handleRemoveLineItem = (productId: string) => {
    setLineItems(lineItems.filter((i) => i.productId !== productId));
  };

  // Calculations
  const subtotalCents = useMemo(
    () => lineItems.reduce((acc, item) => acc + item.quantity * item.unitCostCents, 0),
    [lineItems]
  );

  const discountCents = useMemo(() => {
    const val = parseFloat(discountAmount);
    return isNaN(val) || val < 0 ? 0 : Math.round(val * 100);
  }, [discountAmount]);

  const additionalCostCents = useMemo(() => {
    const val = parseFloat(additionalCostAmount);
    return isNaN(val) || val < 0 ? 0 : Math.round(val * 100);
  }, [additionalCostAmount]);

  const totalCents = Math.max(0, subtotalCents - discountCents + additionalCostCents);

  // Cash validation
  const cashRegisterExpectedCents =
    activeShift && typeof activeShift.expectedAmountCents === 'number'
      ? activeShift.expectedAmountCents
      : 0;
  const isInsufficientCash =
    paymentSource === 'CASH_REGISTER' &&
    (!activeShift || activeShift.status !== 'OPEN' || cashRegisterExpectedCents < totalCents);
  const isDirectReceiptPending = pendingDirectReceipt !== null;
  const isReceiptFieldsLocked = isDirectReceiptPending || isReceivingDirect;
  const isEditableDraft =
    mode === 'create' ||
    (mode === 'resume' && isDraftInCurrentContext && existingDraft?.status === 'DRAFT');
  const isReceiveDirectDisabled =
    isOffline ||
    isSubmitting ||
    isReceivingDirect ||
    !isEditableDraft ||
    (!isDirectReceiptPending && isInsufficientCash);

  const buildDraftItems = (): PurchaseItemLine[] =>
    lineItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents,
    }));

  const handleSaveDraft = async () => {
    setValidationError(null);
    clearActionError();

    if (!supplierId) {
      setValidationError('Seleccioná un proveedor para registrar la compra.');
      return;
    }

    if (lineItems.length === 0) {
      setValidationError('La compra debe contener al menos un producto.');
      return;
    }

    const dto = {
      supplierId,
      documentNumber: documentNumber.trim() || undefined,
      items: buildDraftItems(),
      discountCents,
      additionalCostCents,
      paymentSource,
      notes: notes.trim() || undefined,
    };
    const startedContextKey = currentContextKey;
    const startedDraftKey = draftKey;
    const draft =
      mode === 'resume' && existingDraft
        ? await updateDraft(existingDraft.id, { ...dto, version: existingDraft.version }, context)
        : await createDraft(dto, context);

    if (
      draft &&
      isMountedRef.current &&
      latestContextKeyRef.current === startedContextKey &&
      draftKey === startedDraftKey
    ) {
      onDone();
    }
  };

  const handleReceiveDirect = async () => {
    if (directReceiptInFlightRef.current) return;

    if (contextStaleRef.current) {
      setValidationError(STALE_CONTEXT_MESSAGE);
      return;
    }

    setValidationError(null);
    clearActionError();

    directReceiptInFlightRef.current = true;
    setIsReceivingDirect(true);
    const startedContextKey = currentContextKey;
    const stopReceiving = () => {
      directReceiptInFlightRef.current = false;
      setIsReceivingDirect(false);
    };
    const contextChanged = () => latestContextKeyRef.current !== startedContextKey;
    const stopForStaleContext = () => {
      setValidationError(STALE_CONTEXT_MESSAGE);
      stopReceiving();
    };

    if (pendingDirectReceipt) {
      if (purchaseContextKey(pendingDirectReceipt.context) !== currentContextKey) {
        stopForStaleContext();
        return;
      }

      const ok = await receivePurchase(
        pendingDirectReceipt.draftId,
        pendingDirectReceipt.receipt,
        pendingDirectReceipt.context
      );

      if (isMountedRef.current) {
        if (contextChanged()) {
          stopForStaleContext();
          return;
        }
        if (ok) {
          onDone();
        } else if (usePurchasesStore.getState().receiveConflict) {
          // A 409 is definitive: the draft is stale/closed, never retry it.
          setPendingDirectReceipt(null);
          onDone();
        }
        stopReceiving();
      }
      return;
    }

    if (!supplierId) {
      setValidationError('Seleccioná un proveedor para registrar la compra.');
      stopReceiving();
      return;
    }

    if (lineItems.length === 0) {
      setValidationError('La compra debe contener al menos un producto.');
      stopReceiving();
      return;
    }

    if (paymentSource === 'CASH_REGISTER') {
      const shiftBalance =
        activeShift && typeof activeShift.expectedAmountCents === 'number'
          ? activeShift.expectedAmountCents
          : 0;
      if (!activeShift || activeShift.status !== 'OPEN') {
        setValidationError('No hay ningún turno de caja abierto para registrar el egreso.');
        stopReceiving();
        return;
      }
      if (shiftBalance < totalCents) {
        setValidationError(
          `Saldo insuficiente en caja: se requieren ${Money.fromCents(totalCents).format()} y hay ${Money.fromCents(
            shiftBalance
          ).format()}.`
        );
        stopReceiving();
        return;
      }
    }

    const items: PurchaseItemLine[] = lineItems.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitCostCents: item.unitCostCents,
    }));

    // 1. Create draft, or persist the resumed record without replacement.
    const draft =
      mode === 'resume' && existingDraft
        ? await updateDraft(
            existingDraft.id,
            {
              supplierId,
              documentNumber: documentNumber.trim() || undefined,
              items: buildDraftItems(),
              discountCents,
              additionalCostCents,
              paymentSource,
              notes: notes.trim() || undefined,
              version: existingDraft.version,
            },
            context
          )
        : await createDraft(
            {
              supplierId,
              documentNumber: documentNumber.trim() || undefined,
              items,
              discountCents,
              additionalCostCents,
              paymentSource,
              notes: notes.trim() || undefined,
            },
            context
          );

    if (!isMountedRef.current) return;

    if (contextChanged()) {
      stopForStaleContext();
      return;
    }

    if (!draft) {
      stopReceiving();
      return;
    }

    // 2. Immediately receive with one stable intent
    const receiptIntent: DirectReceiptIntent = {
      draftId: draft.id,
      draftVersion: draft.version,
      receipt: {
        idempotencyKey: crypto.randomUUID(),
        paymentSource,
      },
      context,
    };

    const ok = await receivePurchase(
      receiptIntent.draftId,
      receiptIntent.receipt,
      receiptIntent.context
    );

    if (!isMountedRef.current) return;

    if (contextChanged()) {
      stopForStaleContext();
      return;
    }

    if (ok) {
      onDone();
    } else if (usePurchasesStore.getState().receiveConflict) {
      // Do not retain a stale draft after a definitive receive conflict.
      setPendingDirectReceipt(null);
      onDone();
    } else {
      setPendingDirectReceipt(receiptIntent);
    }

    stopReceiving();
  };

  return (
    <section
      aria-labelledby="purchase-editor-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
    >
      {/* Top action bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: 'var(--radius-pill, 12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--radius-pill, 12px)' }}>
          <button className="pulso-button pulso-button--md"
            type="button"
            onClick={onDone}
            data-testid="purchase-editor-back-btn"
            style={{
              padding: '6px 12px',
              border: '2px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            ← Volver al listado
          </button>
          <h1
            id="purchase-editor-heading"
            style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}
          >
            {mode === 'resume' ? 'REANUDAR COMPRA' : 'NUEVA COMPRA Y REPOSICIÓN'}
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 'var(--radius-sm, 8px)' }}>
          <button className="pulso-button pulso-button--md"
            type="button"
            data-testid="save-draft-btn"
            onClick={handleSaveDraft}
            disabled={isOffline || isSubmitting || isReceiptFieldsLocked || !isEditableDraft}
            style={{
              padding: '8px 16px',
              border: '2px solid var(--color-border)',
              backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
              borderRadius: 'var(--radius-sm)',
              fontWeight: 700,
              cursor:
                isOffline || isSubmitting || isReceiptFieldsLocked ? 'not-allowed' : 'pointer',
            }}
          >
            Guardar Borrador
          </button>
          <button className="pulso-button pulso-button--md"
            type="button"
            data-testid="receive-purchase-btn"
            onClick={handleReceiveDirect}
            disabled={isReceiveDirectDisabled}
            style={{
              padding: '8px 16px',
              border: 'none',
              backgroundColor: 'var(--color-pulse-solid)',
              color: '#0f172a',
              borderRadius: 'var(--radius-xs)',
              fontWeight: 800,
              fontSize: 'var(--text-xs)',
              boxShadow: 'var(--shadow-key)',
              cursor: isReceiveDirectDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {isSubmitting || isReceivingDirect ? 'Procesando...' : 'RECIBIR E INCREMENTAR STOCK'}
          </button>
        </div>
      </div>

      {(validationError || actionError) && (
        <div
          role="alert"
          data-testid="purchase-editor-error"
          style={{
            padding: '10px 12px',
            backgroundColor: 'var(--color-danger-soft, #fee2e2)',
            color: 'var(--color-danger-text)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--text-sm)',
            fontWeight: 600,
          }}
        >
          {validationError || actionError}
        </div>
      )}

      {/* Main Grid: Info + Item Selection */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>
        {/* Left: Metadata & Line Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Header Metadata */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 'var(--radius-pill, 12px)',
              backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
              padding: '16px',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <div>
              <label
                htmlFor="purchase-editor-supplier-select"
                style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: 'var(--radius-xs, 4px)' }}
              >
                Proveedor *
              </label>
              <select className="pulso-select"
                id="purchase-editor-supplier-select"
                data-testid="purchase-editor-supplier-select"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                style={{
                  width: '100%',
                  padding: 'var(--radius-sm, 8px)',
                  borderRadius: 'var(--radius-sm, 8px)',
                  border: '2px solid var(--color-border)',
                }}
              >
                <option value="">-- Seleccionar Proveedor --</option>
                {activeSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.taxId ? `(${s.taxId})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="purchase-editor-invoice-input"
                style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: 'var(--radius-xs, 4px)' }}
              >
                Nº Factura / Remito
              </label>
              <input className="pulso-input"
                type="text"
                ref={invoiceInputRef}
                id="purchase-editor-invoice-input"
                data-testid="purchase-editor-invoice-input"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                placeholder="Ej: FC-0001-00012345"
                disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                style={{
                  width: '100%',
                  padding: 'var(--radius-sm, 8px)',
                  borderRadius: 'var(--radius-sm, 8px)',
                  border: '2px solid var(--color-border)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="purchase-editor-payment-select"
                style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: 'var(--radius-xs, 4px)' }}
              >
                Origen del Pago
              </label>
              <select className="pulso-select"
                id="purchase-editor-payment-select"
                data-testid="purchase-editor-payment-select"
                value={paymentSource}
                onChange={(e) => setPaymentSource(e.target.value as PurchasePaymentSource)}
                disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                style={{
                  width: '100%',
                  padding: 'var(--radius-sm, 8px)',
                  borderRadius: 'var(--radius-sm, 8px)',
                  border: '2px solid var(--color-border)',
                }}
              >
                <option value="OUTSIDE_CASH">Fondos Externos / Fuera de Caja</option>
                <option value="CASH_REGISTER">Egreso de Caja (Caja Actual)</option>
                <option value="UNSPECIFIED">Sin especificar</option>
              </select>
            </div>
          </div>

          {/* Product Line Addition Box */}
          <div
            style={{
              backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
              padding: '16px',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800 }}>
              AGREGAR PRODUCTO
            </h2>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr auto',
                gap: 'var(--radius-pill, 12px)',
                alignItems: 'end',
              }}
            >
              <div>
                <label
                  htmlFor="purchase-item-product-select"
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  Producto
                </label>
                <select className="pulso-select"
                  id="purchase-item-product-select"
                  data-testid="purchase-item-product-select"
                  value={selectedProductId}
                  onChange={(e) => handleSelectProduct(e.target.value)}
                  disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                >
                  <option value="">-- Buscar / Seleccionar Producto --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.barcode ? `[${p.barcode}]` : ''} — Stock: {p.stockQuantity}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="purchase-item-quantity-input"
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  Cantidad
                </label>
                <input className="pulso-input"
                  type="number"
                  id="purchase-item-quantity-input"
                  data-testid="purchase-item-quantity-input"
                  min="1"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(e.target.value)}
                  disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="purchase-item-cost-input"
                  style={{
                    display: 'block',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 700,
                    marginBottom: 'var(--radius-xs, 4px)',
                  }}
                >
                  Costo Unitario ($)
                </label>
                <input className="pulso-input"
                  type="number"
                  step="0.01"
                  min="0"
                  id="purchase-item-cost-input"
                  data-testid="purchase-item-cost-input"
                  value={itemUnitCost}
                  onChange={(e) => setItemUnitCost(e.target.value)}
                  placeholder="0.00"
                  disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 8px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <button className="pulso-button pulso-button--md"
                type="button"
                data-testid="add-line-item-btn"
                onClick={handleAddLineItem}
                disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'var(--color-pulse-solid)',
                  color: '#0f172a',
                  border: 'none',
                  borderRadius: 'var(--radius-sm, 8px)',
                  fontWeight: 700,
                  cursor: isOffline || isReceiptFieldsLocked ? 'not-allowed' : 'pointer',
                  height: '38px',
                }}
              >
                + Agregar
              </button>
            </div>

            {selectedCatalogProduct && (
              <div style={{ marginTop: 'var(--radius-sm, 8px)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>
                Precio de venta actual:{' '}
                {Money.fromCents(selectedCatalogProduct.salePriceCents).format()} · Costo anterior:{' '}
                {selectedCatalogProduct.costPriceCents
                  ? Money.fromCents(selectedCatalogProduct.costPriceCents).format()
                  : 'Sin costo previo'}
              </div>
            )}
          </div>

          {/* Line Items Table */}
          <div
            style={{
              backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
            }}
          >
            <table
              aria-label="Productos de la compra"
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
                    backgroundColor: 'var(--color-surface-sunken)',
                    borderBottom: '1px solid var(--color-border)',
                  }}
                >
                  <th scope="col" style={{ padding: '10px 12px', fontWeight: 800 }}>PRODUCTO</th>
                  <th scope="col" style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>
                    STOCK ACTUAL → NUEVO
                  </th>
                  <th scope="col" style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>
                    CANTIDAD
                  </th>
                  <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>
                    COSTO UNIT.
                  </th>
                  <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>
                    MARGEN ESTIMADO
                  </th>
                  <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>
                    SUBTOTAL
                  </th>
                  <th scope="col" style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 800 }}>
                    ACCIONES
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      data-testid="no-items-placeholder"
                      style={{
                        padding: '24px',
                        textAlign: 'center',
                        color: 'var(--color-ink-muted)',
                      }}
                    >
                      Aún no agregaste productos a esta compra.
                    </td>
                  </tr>
                ) : (
                  lineItems.map((item) => {
                    const marginCents = item.salePriceCents - item.unitCostCents;
                    const marginPct =
                      item.salePriceCents > 0
                        ? Math.round((marginCents / item.salePriceCents) * 100)
                        : 0;
                    return (
                      <tr
                        key={item.productId}
                        data-testid={`purchase-line-${item.productId}`}
                        style={{ borderBottom: '1px solid var(--color-border)' }}
                      >
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700 }}>{item.productName}</div>
                          {item.barcode && (
                            <div
                              style={{
                                fontSize: '11px',
                                color: 'var(--color-ink-muted)',
                                fontFamily: 'monospace',
                              }}
                            >
                              {item.barcode}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <span style={{ color: 'var(--color-ink-muted)' }}>
                            {item.currentStock} un.
                          </span>{' '}
                          →{' '}
                          <span style={{ fontWeight: 700, color: 'var(--color-success-strong, #166534)' }}>
                            {item.currentStock + item.quantity} un.
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700 }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {Money.fromCents(item.unitCostCents).format()}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          <span
                            style={{
                              color: marginCents >= 0 ? 'var(--color-success-strong, #166534)' : 'var(--color-danger-solid)',
                              fontWeight: 600,
                            }}
                          >
                            {Money.fromCents(marginCents).format()} ({marginPct}%)
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800 }}>
                          {Money.fromCents(item.quantity * item.unitCostCents).format()}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                          <button className="pulso-button pulso-button--md"
                            type="button"
                            onClick={() => handleRemoveLineItem(item.productId)}
                            data-testid={`remove-line-${item.productId}`}
                            disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                            style={{
                              border: 'none',
                              backgroundColor: 'transparent',
                              color: 'var(--color-danger-solid)',
                              cursor:
                                isOffline || isReceiptFieldsLocked ? 'not-allowed' : 'pointer',
                              fontWeight: 700,
                            }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Totals, Cash Status, & Adjustments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Summary Box */}
          <div
            style={{
              backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
              padding: '16px',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <h2 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 800 }}>
              RESUMEN DE LA COMPRA
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--radius-sm, 8px)', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-ink-muted)' }}>Subtotal artículos:</span>
                <span style={{ fontWeight: 700 }}>{Money.fromCents(subtotalCents).format()}</span>
              </div>

              <div>
                <label
                  htmlFor="purchase-discount-input"
                  style={{ display: 'block', fontSize: '11px', color: 'var(--color-ink-muted)' }}
                >
                  Descuento ($)
                </label>
                <input className="pulso-input"
                  type="number"
                  step="0.01"
                  min="0"
                  id="purchase-discount-input"
                  data-testid="purchase-discount-input"
                  value={discountAmount}
                  onChange={(e) => setDiscountAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 6px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="purchase-additional-cost-input"
                  style={{ display: 'block', fontSize: '11px', color: 'var(--color-ink-muted)' }}
                >
                  Costos adicionales / Flete ($)
                </label>
                <input className="pulso-input"
                  type="number"
                  step="0.01"
                  min="0"
                  id="purchase-additional-cost-input"
                  data-testid="purchase-additional-cost-input"
                  value={additionalCostAmount}
                  onChange={(e) => setAdditionalCostAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
                  style={{
                    width: '100%',
                    padding: 'var(--radius-sm, 6px)',
                    borderRadius: 'var(--radius-sm, 8px)',
                    border: '2px solid var(--color-border)',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '18px',
                  fontWeight: 800,
                  borderTop: '2px solid var(--color-border)',
                  paddingTop: 'var(--radius-sm, 8px)',
                  marginTop: 'var(--radius-sm, 8px)',
                }}
              >
                <span>TOTAL:</span>
                <span data-testid="purchase-editor-total">
                  {Money.fromCents(totalCents).format()}
                </span>
              </div>
            </div>
          </div>

          {/* Cash Register Condition Status */}
          {paymentSource === 'CASH_REGISTER' && (
            <div
              style={{
                backgroundColor: isInsufficientCash ? 'var(--color-danger-bg, #fef2f2)' : 'var(--color-success-bg, #f0fdf4)',
                border: `1px solid ${isInsufficientCash ? 'var(--color-danger-border, #fecaca)' : 'var(--color-success-border, #bbf7d0)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--radius-pill, 12px)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div
                style={{
                  fontWeight: 800,
                  color: isInsufficientCash ? 'var(--color-danger-solid)' : 'var(--color-success-strong, #166534)',
                  marginBottom: 'var(--radius-xs, 4px)',
                }}
              >
                {isInsufficientCash
                  ? '⚠️ CAJA INSUFICIENTE / CERRADA'
                  : '✓ SALDO DE CAJA DISPONIBLE'}
              </div>
              <div>
                Saldo esperado en caja:{' '}
                <strong data-testid="cash-available-indicator">
                  {Money.fromCents(cashRegisterExpectedCents).format()}
                </strong>
              </div>
              {isInsufficientCash && (
                <div style={{ color: 'var(--color-danger-solid)', marginTop: 'var(--radius-xs, 4px)' }}>
                  No se puede procesar el egreso por caja porque el saldo esperado es menor al total
                  de la compra o no hay turno abierto.
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div
            style={{
              backgroundColor: 'var(--color-surface-sunken, var(--color-surface))',
              padding: 'var(--radius-pill, 12px)',
              border: '2px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <label
              htmlFor="purchase-notes-input"
              style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: 'var(--radius-xs, 4px)' }}
            >
              Notas / Observaciones
            </label>
            <textarea
              id="purchase-notes-input"
              data-testid="purchase-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalles sobre entrega, pagos parciales externos, etc."
              rows={3}
              disabled={isOffline || isReceiptFieldsLocked || !isEditableDraft}
              style={{
                width: '100%',
                padding: 'var(--radius-sm, 6px)',
                borderRadius: 'var(--radius-sm, 8px)',
                border: '2px solid var(--color-border)',
              }}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

