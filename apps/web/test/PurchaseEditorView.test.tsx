import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PurchaseEditorView } from '../src/features/purchases/components/PurchaseEditorView';
import type { PurchaseDetailResponse } from '@pulso/contracts';

const actions = vi.hoisted(() => ({
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  receivePurchase: vi.fn(),
  clearActionError: vi.fn(),
}));

const purchaseStoreState = vi.hoisted(() => ({ receiveConflict: false }));

const cashState = vi.hoisted(() => ({
  activeShift: null as null | { status: 'OPEN' | 'CLOSED'; expectedAmountCents: number },
}));

vi.mock('../src/features/purchases/store/purchases.store', () => {
  const usePurchasesStore = Object.assign(() => ({
    ...actions,
    suppliers: [{ id: 'supplier-1', name: 'Distribuidora', isActive: true }],
    isSubmitting: false,
    actionError: null,
  }), {
    getState: () => purchaseStoreState,
  });
  return { usePurchasesStore };
});

vi.mock('../src/features/catalog/store/catalog.store', () => ({
  useCatalogStore: () => ({
    products: [
      {
        id: 'product-1',
        name: 'Yerba',
        stockQuantity: '5',
        costPriceCents: 25000,
        salePriceCents: 35000,
      },
    ],
  }),
}));

vi.mock('../src/features/cash/store/cash.store', () => ({
  useCashStore: () => ({ activeShift: cashState.activeShift }),
}));

const context = { tenantId: 'tenant-1', locationId: 'location-1' };
const otherContext = { tenantId: 'tenant-2', locationId: 'location-2' };

const resumedDraft: PurchaseDetailResponse = {
  id: 'draft-7',
  tenantId: context.tenantId,
  locationId: context.locationId,
  supplierId: 'supplier-1',
  supplier: { id: 'supplier-1', name: 'Distribuidora', taxId: null },
  status: 'DRAFT',
  documentNumber: 'OLD-7',
  purchasedAtUtc: '2026-09-12T00:00:00Z',
  receivedAtUtc: null,
  createdByUserId: 'u-1',
  subtotalCents: 500,
  discountCents: 0,
  additionalCostCents: 0,
  totalCents: 500,
  paymentSource: 'UNSPECIFIED',
  cashShiftId: null,
  cashMovementId: null,
  notes: 'Persistir',
  itemsCount: 1,
  version: 4,
  createdAt: '2026-09-12T00:00:00Z',
  updatedAt: '2026-09-12T00:00:00Z',
  items: [
    {
      id: 'line-1',
      purchaseId: 'draft-7',
      productId: 'product-1',
      productNameSnapshot: 'Yerba',
      barcodeSnapshot: null,
      quantity: 2,
      unitCostCents: 250,
      lineTotalCents: 500,
      currentStock: '5',
      lastCostCents: 250,
      salePriceCents: 350,
      createdAt: '2026-09-12T00:00:00Z',
    },
  ],
};

function preparePurchase(currentContext = context) {
  const onDone = vi.fn();
  const view = render(
    <PurchaseEditorView context={currentContext} isOffline={false} onDone={onDone} />
  );
  fireEvent.change(screen.getByTestId('purchase-editor-supplier-select'), {
    target: { value: 'supplier-1' },
  });
  fireEvent.change(screen.getByTestId('purchase-editor-invoice-input'), {
    target: { value: 'FC-123' },
  });
  fireEvent.change(screen.getByTestId('purchase-notes-input'), {
    target: { value: 'Entrega completa' },
  });
  fireEvent.change(screen.getByTestId('purchase-item-product-select'), {
    target: { value: 'product-1' },
  });
  fireEvent.change(screen.getByTestId('purchase-item-quantity-input'), { target: { value: '2' } });
  fireEvent.click(screen.getByTestId('add-line-item-btn'));
  return { ...view, onDone };
}

async function receive() {
  await act(async () => {
    fireEvent.click(screen.getByTestId('receive-purchase-btn'));
  });
}

describe('PurchaseEditorView direct receipt recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    actions.createDraft.mockResolvedValue({ id: 'purchase-1' });
    actions.receivePurchase.mockResolvedValue(true);
    purchaseStoreState.receiveConflict = false;
    cashState.activeShift = null;
  });

  afterEach(cleanup);

  it('exposes accessible names for every purchase editor field', () => {
    render(<PurchaseEditorView context={context} isOffline={false} onDone={vi.fn()} />);

    expect(screen.getByRole('combobox', { name: 'Proveedor *' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Nº Factura / Remito' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Origen del Pago' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Producto' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Costo Unitario ($)' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Descuento ($)' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Costos adicionales / Flete ($)' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Notas / Observaciones' })).toBeInTheDocument();
  });

  it('places focus in the invoice field when opening a resumed editor', () => {
    render(
      <PurchaseEditorView
        context={context}
        isOffline={false}
        onDone={vi.fn()}
        existingDraft={resumedDraft}
        mode="resume"
      />
    );

    expect(screen.getByTestId('purchase-editor-invoice-input')).toHaveFocus();
  });

  it('rejects decimal item quantities instead of truncating them', () => {
    render(<PurchaseEditorView context={context} isOffline={false} onDone={vi.fn()} />);
    fireEvent.change(screen.getByTestId('purchase-item-product-select'), {
      target: { value: 'product-1' },
    });
    fireEvent.change(screen.getByTestId('purchase-item-quantity-input'), {
      target: { value: '1.5' },
    });

    fireEvent.click(screen.getByTestId('add-line-item-btn'));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'La cantidad debe ser un número entero mayor a 0.'
    );
    expect(screen.queryByTestId('purchase-line-product-1')).not.toBeInTheDocument();
  });

  it('retries an ambiguous receipt using one draft and the exact same receipt intent', async () => {
    // The store returns false when a committed receipt response is lost.
    actions.receivePurchase.mockResolvedValueOnce(false);
    const { onDone } = preparePurchase();

    await receive();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByTestId('purchase-editor-invoice-input')).toHaveValue('FC-123');
    expect(screen.getByTestId('purchase-notes-input')).toHaveValue('Entrega completa');
    expect(screen.getByTestId('purchase-line-product-1')).toHaveTextContent('Yerba');
    const firstReceipt = actions.receivePurchase.mock.calls[0];
    expect(firstReceipt).toEqual([
      'purchase-1',
      { idempotencyKey: expect.any(String), paymentSource: 'OUTSIDE_CASH' },
      context,
    ]);

    await receive();

    expect(actions.createDraft).toHaveBeenCalledTimes(1);
    expect(actions.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: 'supplier-1',
        documentNumber: 'FC-123',
        items: [{ productId: 'product-1', quantity: 2, unitCostCents: 25000 }],
      }),
      context
    );
    expect(actions.receivePurchase).toHaveBeenCalledTimes(2);
    expect(actions.receivePurchase.mock.calls[1]).toEqual(firstReceipt);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('finishes on a definitive receipt conflict instead of retaining a retryable intent', async () => {
    actions.receivePurchase.mockImplementationOnce(async () => {
      purchaseStoreState.receiveConflict = true;
      return false;
    });
    const { onDone } = preparePurchase();

    await receive();

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('purchase-editor-invoice-input')).toHaveValue('FC-123');
    expect(actions.receivePurchase).toHaveBeenCalledTimes(1);
  });

  it('locks pending receipt fields and draft creation while leaving receipt retry available', async () => {
    actions.receivePurchase.mockResolvedValueOnce(false);
    preparePurchase();
    await receive();

    expect(screen.getByTestId('purchase-editor-supplier-select')).toBeDisabled();
    expect(screen.getByTestId('purchase-editor-invoice-input')).toBeDisabled();
    expect(screen.getByTestId('purchase-editor-payment-select')).toBeDisabled();
    expect(screen.getByTestId('purchase-notes-input')).toBeDisabled();
    expect(screen.getByTestId('purchase-discount-input')).toBeDisabled();
    expect(screen.getByTestId('purchase-additional-cost-input')).toBeDisabled();
    expect(screen.getByTestId('add-line-item-btn')).toBeDisabled();
    expect(screen.getByTestId('remove-line-product-1')).toBeDisabled();
    expect(screen.getByTestId('save-draft-btn')).toBeDisabled();
    expect(screen.getByTestId('receive-purchase-btn')).toBeEnabled();
  });

  it('blocks retrying an ambiguous receipt intent after tenant or location context changes', async () => {
    actions.receivePurchase.mockResolvedValueOnce(false);
    const { onDone, rerender } = preparePurchase();

    await receive();
    const firstReceipt = actions.receivePurchase.mock.calls[0];
    rerender(<PurchaseEditorView context={otherContext} isOffline={false} onDone={onDone} />);

    await receive();

    expect(actions.createDraft).toHaveBeenCalledTimes(1);
    expect(actions.receivePurchase).toHaveBeenCalledTimes(1);
    expect(actions.receivePurchase.mock.calls[0]).toEqual(firstReceipt);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La sesión de trabajo cambió. Volvé al listado y cargá la compra en la sucursal actual.'
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('retries the same cash-register receipt intent even if the live shift becomes closed after an ambiguous response', async () => {
    actions.receivePurchase.mockResolvedValueOnce(false);
    cashState.activeShift = { status: 'OPEN', expectedAmountCents: 100000 };
    const { onDone, rerender } = preparePurchase();
    fireEvent.change(screen.getByTestId('purchase-editor-payment-select'), {
      target: { value: 'CASH_REGISTER' },
    });

    await receive();
    const firstReceipt = actions.receivePurchase.mock.calls[0];
    cashState.activeShift = { status: 'CLOSED', expectedAmountCents: 0 };
    rerender(<PurchaseEditorView context={context} isOffline={false} onDone={onDone} />);

    expect(screen.getByTestId('receive-purchase-btn')).toBeEnabled();
    await receive();

    expect(actions.createDraft).toHaveBeenCalledTimes(1);
    expect(actions.receivePurchase).toHaveBeenCalledTimes(2);
    expect(actions.receivePurchase.mock.calls[1]).toEqual(firstReceipt);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not start receipt when tenant or location context changes while draft creation is unresolved', async () => {
    let resolveDraft!: (value: { id: string }) => void;
    actions.createDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve;
        })
    );
    const { onDone, rerender } = preparePurchase();
    fireEvent.click(screen.getByTestId('receive-purchase-btn'));
    expect(actions.createDraft).toHaveBeenCalledTimes(1);

    rerender(<PurchaseEditorView context={otherContext} isOffline={false} onDone={onDone} />);
    await act(async () => {
      resolveDraft({ id: 'purchase-1' });
    });

    expect(actions.receivePurchase).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'La sesión de trabajo cambió. Volvé al listado y cargá la compra en la sucursal actual.'
    );
    expect(onDone).not.toHaveBeenCalled();
  });

  it('coalesces rapid duplicate submissions before the draft request resolves', async () => {
    let resolveDraft!: (value: { id: string }) => void;
    actions.createDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve;
        })
    );
    const { onDone } = preparePurchase();
    const button = screen.getByTestId('receive-purchase-btn');

    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(actions.createDraft).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveDraft({ id: 'purchase-1' });
    });
    expect(actions.receivePurchase).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not start receipt after the editor unmounts while creating a draft', async () => {
    let resolveDraft!: (value: { id: string }) => void;
    actions.createDraft.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDraft = resolve;
        })
    );
    const { unmount, onDone } = preparePurchase();
    fireEvent.click(screen.getByTestId('receive-purchase-btn'));
    expect(actions.createDraft).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      resolveDraft({ id: 'purchase-1' });
    });
    expect(actions.receivePurchase).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('hydrates a draft and saves the same id/version without creating a replacement', async () => {
    actions.updateDraft.mockResolvedValue(resumedDraft);
    const onDone = vi.fn();
    render(
      <PurchaseEditorView
        context={context}
        isOffline={false}
        onDone={onDone}
        existingDraft={resumedDraft}
        mode="resume"
      />
    );
    expect(screen.getByTestId('purchase-editor-invoice-input')).toHaveValue('OLD-7');
    expect(screen.getByTestId('purchase-editor-supplier-select')).toHaveValue('supplier-1');
    expect(screen.getByTestId('purchase-editor-payment-select')).toHaveValue('UNSPECIFIED');
    expect(screen.getByTestId('purchase-notes-input')).toHaveValue('Persistir');
    expect(screen.getByTestId('purchase-discount-input')).toHaveValue(0);
    expect(screen.getByTestId('purchase-additional-cost-input')).toHaveValue(0);
    expect(screen.getByTestId('purchase-line-product-1')).toHaveTextContent('Yerba');
    fireEvent.click(screen.getByTestId('save-draft-btn'));
    await waitFor(() =>
      expect(actions.updateDraft).toHaveBeenCalledWith(
        'draft-7',
        expect.objectContaining({ paymentSource: 'UNSPECIFIED', version: 4 }),
        context
      )
    );
    expect(actions.createDraft).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it('keeps create mode editable and saves through createDraft', async () => {
    const { onDone } = preparePurchase();

    expect(screen.getByTestId('purchase-editor-supplier-select')).toBeEnabled();
    expect(screen.getByTestId('save-draft-btn')).toBeEnabled();
    fireEvent.click(screen.getByTestId('save-draft-btn'));

    await waitFor(() => expect(actions.createDraft).toHaveBeenCalledTimes(1));
    expect(actions.updateDraft).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite resumed edits when the same draft rerenders', () => {
    const { rerender } = render(
      <PurchaseEditorView
        context={context}
        isOffline={false}
        onDone={vi.fn()}
        existingDraft={resumedDraft}
        mode="resume"
      />
    );
    fireEvent.change(screen.getByTestId('purchase-editor-invoice-input'), {
      target: { value: 'LOCAL-EDIT' },
    });

    rerender(
      <PurchaseEditorView
        context={context}
        isOffline={false}
        onDone={vi.fn()}
        existingDraft={{ ...resumedDraft }}
        mode="resume"
      />
    );

    expect(screen.getByTestId('purchase-editor-invoice-input')).toHaveValue('LOCAL-EDIT');
  });

  it('keeps terminal purchases read-only when supplied directly', () => {
    render(
      <PurchaseEditorView
        context={context}
        isOffline={false}
        onDone={vi.fn()}
        existingDraft={{ ...resumedDraft, status: 'RECEIVED' }}
        mode="resume"
      />
    );

    expect(screen.getByTestId('purchase-editor-invoice-input')).toBeDisabled();
    expect(screen.getByTestId('purchase-notes-input')).toBeDisabled();
    expect(screen.getByTestId('save-draft-btn')).toBeDisabled();
    expect(screen.getByTestId('receive-purchase-btn')).toBeDisabled();
  });
});
