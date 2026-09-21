import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePurchasesStore } from '../src/features/purchases/store/purchases.store';
import { purchasesApi } from '../src/features/purchases/services/purchases-api';
import type {
  SupplierResponse,
  PurchaseResponse,
  PurchaseDetailResponse,
  PaginatedSuppliersResponse,
  PaginatedPurchasesResponse,
} from '@pulso/contracts';
import { ApiError } from '../src/services/api-client';

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

const mockSupplier: SupplierResponse = {
  id: 'sup-1',
  tenantId: 'tenant-1',
  name: 'Distribuidora Central SRL',
  normalizedName: 'distribuidora central srl',
  taxId: '30-71234567-9',
  phone: '1145678900',
  email: 'ventas@distribuidora.com',
  address: 'Av. Corrientes 1234, CABA',
  notes: 'Entrega los martes',
  isActive: true,
  createdAt: '2026-09-06T10:00:00.000Z',
  updatedAt: '2026-09-06T10:00:00.000Z',
};

const mockPurchase: PurchaseResponse = {
  id: 'pur-1',
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  supplierId: 'sup-1',
  supplier: {
    id: 'sup-1',
    name: 'Distribuidora Central SRL',
    taxId: '30-71234567-9',
  },
  status: 'DRAFT',
  documentNumber: 'FAC-A-0001-00001234',
  purchasedAtUtc: '2026-09-06T10:30:00.000Z',
  receivedAtUtc: null,
  createdByUserId: 'u-1',
  subtotalCents: 10000,
  discountCents: 0,
  additionalCostCents: 0,
  totalCents: 10000,
  paymentSource: 'OUTSIDE_CASH',
  cashShiftId: null,
  cashMovementId: null,
  notes: 'Pedido reposición golosinas',
  itemsCount: 1,
  version: 1,
  createdAt: '2026-09-06T10:30:00.000Z',
  updatedAt: '2026-09-06T10:30:00.000Z',
};

const mockPurchaseDetail: PurchaseDetailResponse = {
  ...mockPurchase,
  items: [
    {
      id: 'item-1',
      purchaseId: 'pur-1',
      productId: 'prod-1',
      productNameSnapshot: 'Alfajor Triple',
      barcodeSnapshot: '7791234567890',
      quantity: 10,
      unitCostCents: 1000,
      lineTotalCents: 10000,
      createdAt: '2026-09-06T10:30:00.000Z',
    },
  ],
};

const context = { tenantId: 'tenant-1', locationId: 'loc-1' };
const ownerIdentity = { ...context, permissionRole: 'OWNER' as const };
const cashierIdentity = { ...context, permissionRole: 'CASHIER' as const };
const ownedContext = () => ({
  ...context,
  ownerKey: usePurchasesStore.getState().activeContextKey!,
});

describe('usePurchasesStore - State Management & Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePurchasesStore.getState().clearPurchasesSession();
    usePurchasesStore.getState().transitionPurchasesContext(ownerIdentity);
  });

  it('rejects unowned contexts while no active owner key exists', async () => {
    usePurchasesStore.getState().clearPurchasesSession();

    await usePurchasesStore.getState().loadPurchases(context);
    await usePurchasesStore.getState().loadSuppliers({ ...context, ownerKey: 'stale-owner' });
    expect(
      await usePurchasesStore.getState().updateDraft(
        'pur-1',
        { documentNumber: 'BLOCKED', version: 1 },
        { ...context, ownerKey: 'stale-owner' }
      )
    ).toBeNull();
    expect(
      await usePurchasesStore.getState().receivePurchase(
        'pur-1',
        {
          idempotencyKey: '00000000-0000-0000-0000-000000000098',
          paymentSource: 'UNSPECIFIED',
        },
        context
      )
    ).toBe(false);

    expect(purchasesApi.fetchPurchases).not.toHaveBeenCalled();
    expect(purchasesApi.fetchSuppliers).not.toHaveBeenCalled();
    expect(purchasesApi.updateDraft).not.toHaveBeenCalled();
    expect(purchasesApi.receivePurchase).not.toHaveBeenCalled();
    expect(usePurchasesStore.getState().activeContextKey).toBeNull();
  });

  describe('Suppliers Management', () => {
    it('loads suppliers successfully and updates pagination metadata', async () => {
      const mockResponse: PaginatedSuppliersResponse = {
        items: [mockSupplier],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      vi.mocked(purchasesApi.fetchSuppliers).mockResolvedValue(mockResponse);

      await usePurchasesStore.getState().loadSuppliers(context);

      const state = usePurchasesStore.getState();
      expect(state.suppliers).toEqual([mockSupplier]);
      expect(state.suppliersTotal).toBe(1);
      expect(state.isLoadingSuppliers).toBe(false);
      expect(state.suppliersError).toBeNull();
      expect(purchasesApi.fetchSuppliers).toHaveBeenCalledWith(undefined);
    });

    it('handles loadSuppliers failure gracefully', async () => {
      vi.mocked(purchasesApi.fetchSuppliers).mockRejectedValue(new Error('Network error'));

      await usePurchasesStore.getState().loadSuppliers(context);

      const state = usePurchasesStore.getState();
      expect(state.suppliers).toEqual([]);
      expect(state.isLoadingSuppliers).toBe(false);
      expect(state.suppliersError).toBe('Network error');
    });

    it('creates supplier and reloads supplier list', async () => {
      // First load suppliers so active context is set
      vi.mocked(purchasesApi.fetchSuppliers).mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      await usePurchasesStore.getState().loadSuppliers(context);

      vi.mocked(purchasesApi.createSupplier).mockResolvedValue(mockSupplier);

      const res = await usePurchasesStore.getState().createSupplier(
        {
          name: 'Distribuidora Central SRL',
          taxId: '30-71234567-9',
        },
        ownedContext()
      );

      expect(res).toEqual(mockSupplier);
      const state = usePurchasesStore.getState();
      expect(state.actionError).toBeNull();
      expect(state.suppliers).toHaveLength(1);
      expect(state.suppliers[0]).toEqual(mockSupplier);
    });

    it('toggles supplier active status and refreshes list', async () => {
      const updatedSupplier = { ...mockSupplier, isActive: false };
      vi.mocked(purchasesApi.toggleSupplierStatus).mockResolvedValue(updatedSupplier);
      vi.mocked(purchasesApi.fetchSuppliers).mockResolvedValue({
        items: [updatedSupplier],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      usePurchasesStore.getState().transitionPurchasesContext(ownerIdentity);

      const success = await usePurchasesStore
        .getState()
        .toggleSupplierStatus('sup-1', false, ownedContext());

      expect(success).toBe(true);
      expect(purchasesApi.toggleSupplierStatus).toHaveBeenCalledWith('sup-1', false);
    });
  });

  describe('Purchases Management', () => {
    it('loads purchases and updates state', async () => {
      const mockResponse: PaginatedPurchasesResponse = {
        items: [mockPurchase],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue(mockResponse);

      await usePurchasesStore.getState().loadPurchases(context);

      const state = usePurchasesStore.getState();
      expect(state.purchases).toEqual([mockPurchase]);
      expect(state.purchasesTotal).toBe(1);
      expect(state.isLoadingPurchases).toBe(false);
    });

    it('maps a detail 404 to a context-safe unavailable state', async () => {
      vi.mocked(purchasesApi.fetchPurchaseById).mockRejectedValue(new ApiError(404, 'Not found'));

      await usePurchasesStore.getState().loadPurchaseDetail('pur-missing', context);

      expect(usePurchasesStore.getState().selectedPurchase).toBeNull();
      expect(usePurchasesStore.getState().detailError).toBe(
        'La compra ya no está disponible en la sucursal actual.'
      );
    });

    it('creates purchase draft and reloads purchases', async () => {
      vi.mocked(purchasesApi.createDraft).mockResolvedValue(mockPurchaseDetail);
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [mockPurchase],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const res = await usePurchasesStore.getState().createDraft(
        {
          supplierId: 'sup-1',
          items: [{ productId: 'prod-1', quantity: 10, unitCostCents: 1000 }],
          discountCents: 0,
          additionalCostCents: 0,
          paymentSource: 'OUTSIDE_CASH',
        },
        context
      );

      expect(res).toEqual(mockPurchaseDetail);
      expect(usePurchasesStore.getState().actionError).toBeNull();
    });

  it('receives purchase successfully and clears selected purchase detail', async () => {
      vi.mocked(purchasesApi.receivePurchase).mockResolvedValue({
        success: true,
        purchase: { ...mockPurchaseDetail, status: 'RECEIVED' },
        idempotentReplay: false,
      });
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [{ ...mockPurchase, status: 'RECEIVED' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const success = await usePurchasesStore
        .getState()
        .receivePurchase(
          'pur-1',
          { idempotencyKey: '00000000-0000-0000-0000-000000000001', paymentSource: 'OUTSIDE_CASH' },
          context
        );

      expect(success).toBe(true);
      expect(usePurchasesStore.getState().actionError).toBeNull();
    });

    it('clears detail ownership and terminal receive metadata after confirmed success', async () => {
      const owner = ownedContext();
      usePurchasesStore.setState({
        selectedPurchase: mockPurchaseDetail,
        detailOwnerKey: owner.ownerKey,
        receiveIntentKey: '00000000-0000-0000-0000-000000000099',
      });
      vi.mocked(purchasesApi.receivePurchase).mockResolvedValue({
        success: true,
        purchase: { ...mockPurchaseDetail, status: 'RECEIVED' },
        idempotentReplay: false,
      });
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [{ ...mockPurchase, status: 'RECEIVED' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      expect(await usePurchasesStore.getState().receivePurchase('pur-1', {
        idempotencyKey: '00000000-0000-0000-0000-000000000099',
        paymentSource: 'UNSPECIFIED',
      }, owner)).toBe(true);

      expect(usePurchasesStore.getState()).toEqual(expect.objectContaining({
        selectedPurchase: null,
        detailOwnerKey: null,
        receiveIntentKey: null,
        activeMutationKey: null,
      }));
    });

    it('captures errors when receiving purchase fails (e.g. insufficient cash)', async () => {
      vi.mocked(purchasesApi.receivePurchase).mockRejectedValue(
        new Error('Saldo insuficiente en caja')
      );

      const success = await usePurchasesStore.getState().receivePurchase(
        'pur-1',
        {
          idempotencyKey: '00000000-0000-0000-0000-000000000002',
          paymentSource: 'CASH_REGISTER',
        },
        context
      );

      expect(success).toBe(false);
      expect(usePurchasesStore.getState().actionError).toBe('Saldo insuficiente en caja');
    });

    it('cancels purchase draft', async () => {
      vi.mocked(purchasesApi.cancelPurchase).mockResolvedValue({
        ...mockPurchaseDetail,
        status: 'CANCELLED',
      });
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [{ ...mockPurchase, status: 'CANCELLED' }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });

      const success = await usePurchasesStore
        .getState()
        .cancelPurchase('pur-1', { reason: 'Error en cantidades' }, context);

      expect(success).toBe(true);
    });

    it('forwards the exact resumed version and keeps the same draft identity', async () => {
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [mockPurchase],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      await usePurchasesStore.getState().loadPurchases(context);
      vi.mocked(purchasesApi.updateDraft).mockResolvedValue({
        ...mockPurchaseDetail,
        documentNumber: 'UPDATED',
        version: 2,
      });

      const updated = await usePurchasesStore
        .getState()
        .updateDraft('pur-1', { documentNumber: 'UPDATED', version: 1 }, context);

      expect(purchasesApi.updateDraft).toHaveBeenCalledWith('pur-1', {
        documentNumber: 'UPDATED',
        version: 1,
      });
      expect(updated).toEqual(expect.objectContaining({ id: 'pur-1', version: 2 }));
      expect(purchasesApi.createDraft).not.toHaveBeenCalled();
    });

    it.each([
      [404, 'La compra ya no está disponible en la sucursal actual.'],
      [409, 'Otra operación modificó o cerró este borrador. Actualizamos el listado.'],
    ])('reconciles update failure %s without false success', async (status, expectedMessage) => {
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [mockPurchase],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      await usePurchasesStore.getState().loadPurchases(context);
      usePurchasesStore.setState({ selectedPurchase: mockPurchaseDetail });
      vi.mocked(purchasesApi.updateDraft).mockRejectedValue(
        new ApiError(status, status === 404 ? 'Not found' : 'Conflict')
      );

      const updated = await usePurchasesStore
        .getState()
        .updateDraft('pur-1', { documentNumber: 'STALE', version: 1 }, context);

      expect(updated).toBeNull();
      expect(usePurchasesStore.getState().selectedPurchase).toBeNull();
      expect(usePurchasesStore.getState().actionError).toBe(expectedMessage);
      expect(purchasesApi.fetchPurchases).toHaveBeenCalledTimes(2);
    });

    it('ignores a stale receive rejection after session context is cleared', async () => {
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [mockPurchase],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      await usePurchasesStore.getState().loadPurchases(context);
      let rejectReceive!: (error: Error) => void;
      vi.mocked(purchasesApi.receivePurchase).mockReturnValue(
        new Promise((_, reject) => {
          rejectReceive = reject;
        })
      );

      const pending = usePurchasesStore.getState().receivePurchase(
        'pur-1',
        {
          idempotencyKey: '00000000-0000-0000-0000-000000000003',
          paymentSource: 'OUTSIDE_CASH',
        },
        context
      );
      usePurchasesStore.getState().clearPurchasesSession();
      rejectReceive(new ApiError(409, 'Conflict'));

      expect(await pending).toBe(false);
      expect(usePurchasesStore.getState().actionError).toBeNull();
      expect(usePurchasesStore.getState().selectedPurchase).toBeNull();
      expect(purchasesApi.fetchPurchases).toHaveBeenCalledTimes(1);
    });

    it('ignores an update response when the selected draft version changed in flight', async () => {
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [mockPurchase],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      await usePurchasesStore.getState().loadPurchases(context);
      usePurchasesStore.setState({ selectedPurchase: mockPurchaseDetail });
      let resolveUpdate!: (value: PurchaseDetailResponse) => void;
      vi.mocked(purchasesApi.updateDraft).mockReturnValue(
        new Promise((resolve) => {
          resolveUpdate = resolve;
        })
      );

      const pending = usePurchasesStore
        .getState()
        .updateDraft('pur-1', { documentNumber: 'LOCAL', version: 1 }, context);
      usePurchasesStore.setState({
        selectedPurchase: { ...mockPurchaseDetail, documentNumber: 'REMOTE', version: 2 },
      });
      resolveUpdate({ ...mockPurchaseDetail, documentNumber: 'LOCAL', version: 2 });

      expect(await pending).toBeNull();
      expect(usePurchasesStore.getState().selectedPurchase).toEqual(
        expect.objectContaining({ documentNumber: 'REMOTE', version: 2 })
      );
      expect(usePurchasesStore.getState().isSubmitting).toBe(false);
      expect(purchasesApi.fetchPurchases).toHaveBeenCalledTimes(1);
    });
  });

  describe('Session Context & Isolation', () => {
    it('synchronously clears every owned surface and invalidates all epochs on role transitions', async () => {
      const store = usePurchasesStore.getState();
      const ownerContext = store.transitionPurchasesContext(ownerIdentity);
      const initialEpochs = {
        suppliers: usePurchasesStore.getState().suppliersRequestId,
        purchases: usePurchasesStore.getState().purchasesRequestId,
        detail: usePurchasesStore.getState().detailRequestId,
        mutation: usePurchasesStore.getState().mutationRequestId,
      };

      usePurchasesStore.setState({
        suppliers: [mockSupplier],
        purchases: [mockPurchase],
        selectedPurchase: mockPurchaseDetail,
        suppliersOwnerKey: ownerContext.ownerKey,
        purchasesOwnerKey: ownerContext.ownerKey,
        detailOwnerKey: ownerContext.ownerKey,
        isLoadingSuppliers: true,
        isLoadingPurchases: true,
        isLoadingDetail: true,
        isSubmitting: true,
        suppliersError: 'old supplier error',
        purchasesError: 'old purchase error',
        detailError: 'old detail error',
        actionError: 'old mutation error',
        activeMutationKey: 'old-intent',
        receiveIntentKey: 'old-receive-intent',
      });

      const cashierContext = usePurchasesStore
        .getState()
        .transitionPurchasesContext(cashierIdentity);
      const state = usePurchasesStore.getState();

      expect(cashierContext.ownerKey).toContain('tenant-1::loc-1::CASHIER::');
      expect(state).toEqual(
        expect.objectContaining({
          suppliers: [],
          purchases: [],
          selectedPurchase: null,
          suppliersOwnerKey: null,
          purchasesOwnerKey: null,
          detailOwnerKey: null,
          isLoadingSuppliers: false,
          isLoadingPurchases: false,
          isLoadingDetail: false,
          isSubmitting: false,
          suppliersError: null,
          purchasesError: null,
          detailError: null,
          actionError: null,
          activeMutationKey: null,
          receiveIntentKey: null,
          activePermissionRole: 'CASHIER',
        })
      );
      expect(state.suppliersRequestId).toBeGreaterThan(initialEpochs.suppliers);
      expect(state.purchasesRequestId).toBeGreaterThan(initialEpochs.purchases);
      expect(state.detailRequestId).toBeGreaterThan(initialEpochs.detail);
      expect(state.mutationRequestId).toBeGreaterThan(initialEpochs.mutation);
    });

    it('keeps OWNER reload empty after OWNER to CASHIER to OWNER and ignores the late prior load', async () => {
      let resolveOld!: (value: PaginatedPurchasesResponse) => void;
      vi.mocked(purchasesApi.fetchPurchases)
        .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
        .mockRejectedValueOnce(new Error('Current reload failed'));

      const firstOwner = usePurchasesStore.getState().transitionPurchasesContext(ownerIdentity);
      const oldLoad = usePurchasesStore.getState().loadPurchases(firstOwner);
      usePurchasesStore.getState().transitionPurchasesContext(cashierIdentity);
      const secondOwner = usePurchasesStore.getState().transitionPurchasesContext(ownerIdentity);
      await usePurchasesStore.getState().loadPurchases(secondOwner);

      resolveOld({ items: [mockPurchase], total: 1, page: 1, limit: 20, totalPages: 1 });
      await oldLoad;

      const state = usePurchasesStore.getState();
      expect(secondOwner.ownerKey).not.toBe(firstOwner.ownerKey);
      expect(state.purchases).toEqual([]);
      expect(state.purchasesOwnerKey).toBeNull();
      expect(state.purchasesError).toBe('Current reload failed');
    });

    it('ignores a late receive success after an OWNER to CASHIER to OWNER epoch cycle', async () => {
      let resolveReceive!: (value: {
        success: true;
        purchase: PurchaseDetailResponse;
        idempotentReplay: false;
      }) => void;
      vi.mocked(purchasesApi.receivePurchase).mockReturnValue(
        new Promise((resolve) => (resolveReceive = resolve))
      );
      const firstOwner = usePurchasesStore.getState().transitionPurchasesContext(ownerIdentity);
      usePurchasesStore.setState({
        purchases: [mockPurchase],
        purchasesOwnerKey: firstOwner.ownerKey,
        selectedPurchase: mockPurchaseDetail,
        detailOwnerKey: firstOwner.ownerKey,
      });

      const pending = usePurchasesStore
        .getState()
        .receivePurchase(
          'pur-1',
          { idempotencyKey: '00000000-0000-0000-0000-000000000009', paymentSource: 'UNSPECIFIED' },
          firstOwner
        );
      usePurchasesStore.getState().transitionPurchasesContext(cashierIdentity);
      usePurchasesStore.getState().transitionPurchasesContext(ownerIdentity);
      resolveReceive({
        success: true,
        purchase: { ...mockPurchaseDetail, status: 'RECEIVED', version: 2 },
        idempotentReplay: false,
      });

      expect(await pending).toBe(false);
      expect(usePurchasesStore.getState().purchases).toEqual([]);
      expect(usePurchasesStore.getState().selectedPurchase).toBeNull();
      expect(usePurchasesStore.getState().actionError).toBeNull();
    });

    it('reconciles a receive 409 without success or a blind retry', async () => {
      vi.mocked(purchasesApi.receivePurchase).mockRejectedValue(new ApiError(409, 'Conflict'));
      vi.mocked(purchasesApi.fetchPurchases).mockResolvedValue({
        items: [{ ...mockPurchase, status: 'RECEIVED', version: 2 }],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      const owner = usePurchasesStore.getState().transitionPurchasesContext(ownerIdentity);
      usePurchasesStore.setState({
        selectedPurchase: mockPurchaseDetail,
        detailOwnerKey: owner.ownerKey,
        receiveIntentKey: '00000000-0000-0000-0000-000000000010',
      });

      const succeeded = await usePurchasesStore
        .getState()
        .receivePurchase(
          'pur-1',
          { idempotencyKey: '00000000-0000-0000-0000-000000000010', paymentSource: 'UNSPECIFIED' },
          owner
        );

      expect(succeeded).toBe(false);
      expect(purchasesApi.receivePurchase).toHaveBeenCalledTimes(1);
      expect(purchasesApi.fetchPurchases).toHaveBeenCalledTimes(1);
      expect(usePurchasesStore.getState().selectedPurchase).toEqual(mockPurchaseDetail);
      expect(usePurchasesStore.getState().receiveIntentKey).toBeNull();
      expect(usePurchasesStore.getState().actionError).toContain('Otra operación');
      expect(usePurchasesStore.getState().purchases[0]).toEqual(
        expect.objectContaining({ status: 'RECEIVED', version: 2 })
      );
    });

    it('discards outdated responses when switching tenant context', async () => {
      let delayedResolve: (value: PaginatedSuppliersResponse) => void = () => {};
      vi.mocked(purchasesApi.fetchSuppliers).mockReturnValue(
        new Promise((resolve) => {
          delayedResolve = resolve;
        })
      );

      const call1 = usePurchasesStore
        .getState()
        .loadSuppliers({ tenantId: 'tenant-1', locationId: 'loc-1' });

      // Context switch
      usePurchasesStore.getState().clearPurchasesSession();

      // Resolve stale promise
      delayedResolve({
        items: [mockSupplier],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      await call1;

      // Stale data should not be populated
      expect(usePurchasesStore.getState().suppliers).toEqual([]);
    });
  });
});
