import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PurchaseDetailResponse, PurchaseResponse } from '@pulso/contracts';
import { ApiError, NetworkError } from '../src/services/api-client';
import { PurchaseDetailModal } from '../src/features/purchases/components/PurchaseDetailModal';
import { purchasesApi } from '../src/features/purchases/services/purchases-api';
import { usePurchasesStore } from '../src/features/purchases/store/purchases.store';

vi.mock('../src/features/purchases/services/purchases-api', () => ({
  purchasesApi: {
    fetchSuppliers: vi.fn(),
    createSupplier: vi.fn(),
    updateSupplier: vi.fn(),
    toggleSupplierStatus: vi.fn(),
    fetchPurchases: vi.fn(),
    fetchPurchaseById: vi.fn(),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    receivePurchase: vi.fn(),
    cancelPurchase: vi.fn(),
  },
}));

const context = { tenantId: 'tenant-1', locationId: 'loc-1' };
const draft: PurchaseDetailResponse = {
  id: 'pur-1',
  tenantId: context.tenantId,
  locationId: context.locationId,
  supplierId: 'sup-1',
  supplier: { id: 'sup-1', name: 'Distribuidora', taxId: null },
  status: 'DRAFT',
  documentNumber: 'FAC-1',
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
  notes: null,
  itemsCount: 1,
  version: 3,
  createdAt: '2026-09-12T00:00:00Z',
  updatedAt: '2026-09-12T00:00:00Z',
  items: [
    {
      id: 'line-1',
      purchaseId: 'pur-1',
      productId: 'prod-1',
      productNameSnapshot: 'Yerba',
      barcodeSnapshot: null,
      quantity: 1,
      unitCostCents: 500,
      lineTotalCents: 500,
      createdAt: '2026-09-12T00:00:00Z',
    },
  ],
};

const listResponse = (purchase: PurchaseResponse | null) => ({
  items: purchase ? [purchase] : [],
  total: purchase ? 1 : 0,
  page: 1,
  limit: 20,
  totalPages: 1,
});

const renderModal = () => {
  const onClose = vi.fn();
  const onResume = vi.fn();
  render(
    <PurchaseDetailModal
      onClose={onClose}
      context={context}
      isOffline={false}
      onResume={onResume}
      onRefresh={vi.fn()}
    />
  );
  return { onClose, onResume };
};

describe('PurchaseDetailModal recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePurchasesStore.getState().clearPurchasesSession();
    const owner = usePurchasesStore.getState().transitionPurchasesContext({
      tenantId: context.tenantId,
      locationId: context.locationId,
      permissionRole: 'OWNER',
    });
    usePurchasesStore.setState({
      activeTenantId: context.tenantId,
      activeLocationId: context.locationId,
      activePermissionRole: 'OWNER',
      activeContextKey: owner.ownerKey,
      selectedPurchase: draft,
      purchases: [draft],
      detailOwnerKey: owner.ownerKey,
    });
    vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue(listResponse(draft));
  });

  afterEach(cleanup);

  it('announces detail loading with an accessible dialog name and busy status', () => {
    usePurchasesStore.setState({ isLoadingDetail: true, selectedPurchase: null });

    renderModal();

    expect(screen.getByRole('dialog', { name: 'Detalle de compra' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(screen.getByRole('status')).toHaveTextContent('Cargando detalle de la compra');
  });

  it('keeps the unavailable state inside a named landmark', () => {
    usePurchasesStore.setState({ selectedPurchase: null, detailError: 'No disponible' });

    renderModal();

    expect(screen.getByRole('region', { name: 'Estado de compra' })).toHaveTextContent(
      'No disponible'
    );
  });

  it('moves focus into cancel confirmation and restores it when abandoned', () => {
    renderModal();
    const trigger = screen.getByTestId('cancel-draft-btn');

    fireEvent.click(trigger);
    expect(screen.getByTestId('cancel-reason-input')).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(trigger).toHaveFocus();
    expect(purchasesApi.cancelPurchase).not.toHaveBeenCalled();
  });

  it('shows a context-safe unavailable state and refreshes after a 404 receive', async () => {
    vi.mocked(purchasesApi.receivePurchase).mockRejectedValue(new ApiError(404, 'Not found'));
    vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue(listResponse(null));
    renderModal();

    fireEvent.click(screen.getByTestId('receive-draft-btn'));

    expect(await screen.findByRole('alert', { name: 'Compra no disponible' })).toHaveTextContent(
      'La compra ya no está disponible en la sucursal actual.'
    );
    expect(purchasesApi.fetchPurchases).toHaveBeenCalledTimes(1);
  });

  it('reuses one receive intent after an ambiguous failure and never infers cash', async () => {
    vi.mocked(purchasesApi.receivePurchase)
      .mockRejectedValueOnce(new NetworkError())
      .mockResolvedValueOnce({
        success: true,
        purchase: { ...draft, status: 'RECEIVED', version: 4 },
        idempotentReplay: true,
      });
    const { onClose } = renderModal();

    fireEvent.click(screen.getByTestId('receive-draft-btn'));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByTestId('receive-draft-btn'));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(purchasesApi.receivePurchase).toHaveBeenCalledTimes(2);
    expect(vi.mocked(purchasesApi.receivePurchase).mock.calls[1]).toEqual(
      vi.mocked(purchasesApi.receivePurchase).mock.calls[0]
    );
    expect(vi.mocked(purchasesApi.receivePurchase).mock.calls[0]?.[1]).toEqual({
      idempotencyKey: expect.any(String),
      paymentSource: 'UNSPECIFIED',
    });
  });

  it('drops the receive intent after a definite 409 and never reports success', async () => {
    vi.mocked(purchasesApi.receivePurchase).mockRejectedValue(new ApiError(409, 'Conflict'));
    vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue(
      listResponse({ ...draft, status: 'RECEIVED', version: 4 })
    );
    const { onClose } = renderModal();

    fireEvent.click(screen.getByTestId('receive-draft-btn'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Otra operación');
    expect(screen.getByTestId('purchase-detail-modal')).toBeInTheDocument();
    expect(screen.getByTestId('purchase-detail-action-error')).toHaveTextContent('Otra operación');
    expect(onClose).not.toHaveBeenCalled();
    expect(purchasesApi.receivePurchase).toHaveBeenCalledTimes(1);
    expect(usePurchasesStore.getState().receiveIntentKey).toBeNull();
    expect(usePurchasesStore.getState().selectedPurchase).toEqual(draft);
  });

  it('returns focus to the enabled receive action after a receive conflict', async () => {
    vi.mocked(purchasesApi.receivePurchase).mockRejectedValue(new ApiError(409, 'Conflict'));
    vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue(listResponse(draft));
    renderModal();

    fireEvent.click(screen.getByTestId('receive-draft-btn'));

    await screen.findByTestId('purchase-detail-action-error');
    expect(screen.getByTestId('receive-draft-btn')).toBeEnabled();
    expect(screen.getByTestId('receive-draft-btn')).toHaveFocus();
  });

  it('rotates the store-owned receive intent after a definite 409 before retrying', async () => {
    vi.mocked(purchasesApi.receivePurchase)
      .mockRejectedValueOnce(new ApiError(409, 'Conflict'))
      .mockResolvedValueOnce({
        success: true,
        purchase: { ...draft, status: 'RECEIVED', version: 4 },
        idempotentReplay: false,
      });
    const { onClose } = renderModal();

    fireEvent.click(screen.getByTestId('receive-draft-btn'));
    await screen.findByRole('alert');
    const firstKey = vi.mocked(purchasesApi.receivePurchase).mock.calls[0]?.[1].idempotencyKey;

    fireEvent.click(screen.getByTestId('receive-draft-btn'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const secondKey = vi.mocked(purchasesApi.receivePurchase).mock.calls[1]?.[1].idempotencyKey;
    expect(secondKey).not.toBe(firstKey);
  });

  it('requires confirmation, sends the optional reason, and retains cancelled history', async () => {
    const cancelled = { ...draft, status: 'CANCELLED' as const, version: 4 };
    vi.mocked(purchasesApi.cancelPurchase).mockResolvedValue(cancelled);
    vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue(listResponse(cancelled));
    const { onClose } = renderModal();

    fireEvent.click(screen.getByTestId('cancel-draft-btn'));
    fireEvent.change(screen.getByTestId('cancel-reason-input'), {
      target: { value: ' Duplicada ' },
    });
    await act(async () => fireEvent.click(screen.getByTestId('confirm-cancel-btn')));

    expect(purchasesApi.cancelPurchase).toHaveBeenCalledWith('pur-1', { reason: 'Duplicada' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(usePurchasesStore.getState().purchases[0]?.status).toBe('CANCELLED');
  });
});
