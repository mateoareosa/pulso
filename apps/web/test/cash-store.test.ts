import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useCashStore } from '../src/features/cash/store/cash.store';
import { cashApi } from '../src/features/cash/services/cash-api';
import { ApiError, NetworkError } from '../src/services/api-client';
import type { CashShiftResponse, CashMovementResponse } from '@pulso/contracts';

vi.mock('../src/features/cash/services/cash-api', () => ({
  cashApi: {
    fetchActiveShift: vi.fn(),
    openShift: vi.fn(),
    registerCashIn: vi.fn(),
    registerCashOut: vi.fn(),
    closeShift: vi.fn(),
    fetchShifts: vi.fn(),
    fetchShiftById: vi.fn(),
  },
}));

const mockShift: CashShiftResponse = {
  id: 'shift-100',
  tenantId: 'tenant-1',
  locationId: 'loc-1',
  openedByUserId: 'u-1',
  openedByUser: { id: 'u-1', name: 'Cajero 1', email: 'cajero@pulso.dev' },
  status: 'OPEN',
  openingAmountCents: 500000,
  expectedAmountCents: 500000,
  countedAmountCents: null,
  differenceAmountCents: null,
  openedAtUtc: '2026-09-06T12:00:00.000Z',
  closedAtUtc: null,
  summary: {
    openingAmountCents: 500000,
    cashSalesAmountCents: 0,
    cashInAmountCents: 0,
    cashOutAmountCents: 0,
    refundAmountCents: 0,
    expectedAmountCents: 500000,
    movementsCount: 1,
    salesCount: 0,
  },
  createdAt: '2026-09-06T12:00:00.000Z',
  updatedAt: '2026-09-06T12:00:00.000Z',
};

const context = { tenantId: 'tenant-1', locationId: 'loc-1' };
const cacheKey = 'pulso_cached_shift_tenant-1_loc-1';
const safeOfflineError = 'Sin conexión con el servidor. No se pudo confirmar el estado de caja.';
const safeGenericError = 'No se pudo confirmar el estado de caja. Reintentá.';
const safeMutationGuardError =
  'No se puede modificar la caja hasta confirmar un turno abierto para esta sucursal.';

function seedConfirmedShift(shift: CashShiftResponse = mockShift): void {
  useCashStore.setState({
    activeShift: shift,
    isActiveShiftConfirmed: true,
    activeTenantId: shift.tenantId,
    activeLocationId: shift.locationId,
  });
}

describe('useCashStore - Cash Shift Lifecycle & Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useCashStore.getState().clearCashSession();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  describe('loadActiveShift', () => {
    it('fetches active shift, updates store, and writes to localStorage cache', async () => {
      vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(mockShift);

      await useCashStore.getState().loadActiveShift(context);

      const state = useCashStore.getState();
      expect(state.activeShift).toEqual(mockShift);
      expect(state.isLoadingActive).toBe(false);
      expect(state.error).toBeNull();

      const cached = window.localStorage.getItem('pulso_cached_shift_tenant-1_loc-1');
      expect(cached).not.toBeNull();
      expect(JSON.parse(cached!)).toEqual(mockShift);
    });

    it('removes localStorage cache if active shift is null (no open shift)', async () => {
      window.localStorage.setItem('pulso_cached_shift_tenant-1_loc-1', JSON.stringify(mockShift));
      vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(null);

      await useCashStore.getState().loadActiveShift(context);

      const state = useCashStore.getState();
      expect(state.activeShift).toBeNull();
      const cached = window.localStorage.getItem('pulso_cached_shift_tenant-1_loc-1');
      expect(cached).toBeNull();
    });

    it.each([
      ['OPEN response', mockShift, 'setItem'],
      ['null response', null, 'removeItem'],
    ] as const)(
      'keeps authoritative %s when localStorage.%s throws',
      async (_case, response, storageMethod) => {
        vi.spyOn(Storage.prototype, storageMethod).mockImplementation(() => {
          throw new Error('storage secret');
        });
        vi.mocked(cashApi.fetchActiveShift).mockResolvedValue(response);

        await useCashStore.getState().loadActiveShift(context);

        const state = useCashStore.getState();
        expect(state.activeShift).toEqual(response);
        expect(state.isActiveShiftConfirmed).toBe(true);
        expect(state.isLoadingActive).toBe(false);
        expect(state.error).toBeNull();
      }
    );

    it('falls back only from a real NetworkError to a direct cached shift and uses safe copy', async () => {
      window.localStorage.setItem(cacheKey, JSON.stringify(mockShift));
      vi.mocked(cashApi.fetchActiveShift).mockRejectedValue(
        new NetworkError('raw transport details')
      );

      await useCashStore.getState().loadActiveShift(context);

      const state = useCashStore.getState();
      expect(state.activeShift).toEqual(mockShift);
      expect(state.isActiveShiftConfirmed).toBe(false);
      expect(state.error).toBe(safeOfflineError);
      expect(state.isLoadingActive).toBe(false);
    });

    it.each([
      ['malformed JSON', 'invalid-json-data'],
      ['legacy wrapper shape', JSON.stringify({ shift: mockShift })],
      ['CLOSED status', JSON.stringify({ ...mockShift, status: 'CLOSED' })],
      ['wrong tenant', JSON.stringify({ ...mockShift, tenantId: 'tenant-2' })],
      [
        'invalid nested schema',
        JSON.stringify({
          ...mockShift,
          summary: { ...mockShift.summary, expectedAmountCents: 'not-an-integer' },
        }),
      ],
    ])('evicts %s cache instead of hydrating it after NetworkError', async (_case, cached) => {
      window.localStorage.setItem(cacheKey, cached);
      vi.mocked(cashApi.fetchActiveShift).mockRejectedValue(new NetworkError());

      await useCashStore.getState().loadActiveShift(context);

      const state = useCashStore.getState();
      expect(state.activeShift).toBeNull();
      expect(state.isActiveShiftConfirmed).toBe(false);
      expect(window.localStorage.getItem(cacheKey)).toBeNull();
      expect(state.error).toBe(safeOfflineError);
    });

    it('does not read or hydrate cache for an unexpected Error and does not leak its message', async () => {
      window.localStorage.setItem(cacheKey, JSON.stringify(mockShift));
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      vi.mocked(cashApi.fetchActiveShift).mockRejectedValue(new Error('secret exception text'));

      await useCashStore.getState().loadActiveShift(context);

      const state = useCashStore.getState();
      expect(getItemSpy).not.toHaveBeenCalled();
      expect(state.activeShift).toBeNull();
      expect(state.isActiveShiftConfirmed).toBe(false);
      expect(state.error).toBe(safeGenericError);
      expect(window.localStorage.getItem(cacheKey)).toBe(JSON.stringify(mockShift));
    });

    it.each([
      [401, 'Tu sesión venció. Iniciá sesión nuevamente.'],
      [403, 'No tenés autorización para operar esta caja.'],
    ])(
      'clears state and evicts only exact cache for ApiError %i',
      async (status, expectedError) => {
        const otherCacheKey = 'pulso_cached_shift_tenant-1_loc-2';
        window.localStorage.setItem(cacheKey, JSON.stringify(mockShift));
        window.localStorage.setItem(
          otherCacheKey,
          JSON.stringify({ ...mockShift, locationId: 'loc-2' })
        );
        seedConfirmedShift();
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
        vi.mocked(cashApi.fetchActiveShift).mockRejectedValue(
          new ApiError(status, 'raw server message', { internal: 'details' })
        );

        await useCashStore.getState().loadActiveShift(context);

        const state = useCashStore.getState();
        expect(getItemSpy).not.toHaveBeenCalled();
        expect(state.activeShift).toBeNull();
        expect(state.isActiveShiftConfirmed).toBe(false);
        expect(state.error).toBe(expectedError);
        expect(window.localStorage.getItem(cacheKey)).toBeNull();
        expect(window.localStorage.getItem(otherCacheKey)).not.toBeNull();
      }
    );

    it('keeps the fixed 401 result when exact cache eviction throws', async () => {
      seedConfirmedShift();
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('storage secret');
      });
      vi.mocked(cashApi.fetchActiveShift).mockRejectedValue(new ApiError(401, 'raw auth text'));

      await useCashStore.getState().loadActiveShift(context);

      const state = useCashStore.getState();
      expect(state.activeShift).toBeNull();
      expect(state.isActiveShiftConfirmed).toBe(false);
      expect(state.isLoadingActive).toBe(false);
      expect(state.error).toBe('Tu sesión venció. Iniciá sesión nuevamente.');
    });

    it.each([
      ['other ApiError', new ApiError(500, 'raw API message', { trace: 'secret' })],
      ['unexpected error', new Error('raw exception message')],
    ])(
      'keeps same-context content read-only and does not read cache for %s',
      async (_case, error) => {
        window.localStorage.setItem(cacheKey, JSON.stringify(mockShift));
        seedConfirmedShift();
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
        vi.mocked(cashApi.fetchActiveShift).mockRejectedValue(error);

        const refresh = useCashStore.getState().loadActiveShift(context);

        expect(useCashStore.getState().activeShift).toEqual(mockShift);
        expect(useCashStore.getState().isActiveShiftConfirmed).toBe(false);
        await refresh;
        expect(getItemSpy).not.toHaveBeenCalled();
        expect(useCashStore.getState().activeShift).toEqual(mockShift);
        expect(useCashStore.getState().isActiveShiftConfirmed).toBe(false);
        expect(useCashStore.getState().error).toBe(safeGenericError);
        expect(window.localStorage.getItem(cacheKey)).toBe(JSON.stringify(mockShift));
      }
    );

    it('invalidates context synchronously and ignores stale resolve/reject side effects', async () => {
      let resolveFirst: (shift: CashShiftResponse) => void = () => {};
      let rejectSecond: (error: unknown) => void = () => {};
      vi.mocked(cashApi.fetchActiveShift).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      );
      vi.mocked(cashApi.fetchActiveShift).mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectSecond = reject;
          })
      );
      const previousShift = { ...mockShift, locationId: 'loc-old' };
      const previousCacheKey = 'pulso_cached_shift_tenant-1_loc-old';
      seedConfirmedShift(previousShift);
      useCashStore.setState({ lastClosedShift: { ...previousShift, status: 'CLOSED' } });
      window.localStorage.setItem(previousCacheKey, JSON.stringify(previousShift));

      const firstLoad = useCashStore.getState().loadActiveShift(context);
      expect(useCashStore.getState()).toMatchObject({
        activeShift: null,
        isActiveShiftConfirmed: false,
        lastClosedShift: null,
        isLoadingActive: true,
      });
      const staleRejectKey = 'pulso_cached_shift_tenant-1_loc-mid';
      window.localStorage.setItem(staleRejectKey, 'invalid-json-data');
      const secondLoad = useCashStore
        .getState()
        .loadActiveShift({ tenantId: 'tenant-1', locationId: 'loc-mid' });
      const currentShift = { ...mockShift, id: 'shift-200', locationId: 'loc-2' };
      vi.mocked(cashApi.fetchActiveShift).mockResolvedValueOnce(currentShift);
      await useCashStore.getState().loadActiveShift({ tenantId: 'tenant-1', locationId: 'loc-2' });

      resolveFirst(mockShift);
      rejectSecond(new NetworkError('stale network failure'));
      await Promise.all([firstLoad, secondLoad]);

      const state = useCashStore.getState();
      expect(state.activeShift).toEqual(currentShift);
      expect(state.isActiveShiftConfirmed).toBe(true);
      expect(state.error).toBeNull();
      expect(window.localStorage.getItem(cacheKey)).toBeNull();
      expect(window.localStorage.getItem(staleRejectKey)).toBe('invalid-json-data');
      expect(window.localStorage.getItem(previousCacheKey)).toBe(JSON.stringify(previousShift));
    });

    it('strictly partitions localStorage cache by tenantId and locationId without cross-contamination', async () => {
      const shiftLocA: CashShiftResponse = {
        ...mockShift,
        tenantId: 'tenant-A',
        locationId: 'loc-1',
      };
      const shiftLocB: CashShiftResponse = {
        ...mockShift,
        tenantId: 'tenant-A',
        locationId: 'loc-2',
        id: 'shift-200',
      };

      vi.mocked(cashApi.fetchActiveShift).mockResolvedValueOnce(shiftLocA);
      await useCashStore.getState().loadActiveShift({ tenantId: 'tenant-A', locationId: 'loc-1' });

      vi.mocked(cashApi.fetchActiveShift).mockResolvedValueOnce(shiftLocB);
      await useCashStore.getState().loadActiveShift({ tenantId: 'tenant-A', locationId: 'loc-2' });

      const cachedA = window.localStorage.getItem('pulso_cached_shift_tenant-A_loc-1');
      const cachedB = window.localStorage.getItem('pulso_cached_shift_tenant-A_loc-2');

      expect(JSON.parse(cachedA!)).toEqual(shiftLocA);
      expect(JSON.parse(cachedB!)).toEqual(shiftLocB);
      expect(JSON.parse(cachedA!).id).not.toEqual(JSON.parse(cachedB!).id);
    });
  });

  describe('openShift', () => {
    it('opens shift successfully, sets activeShift, and caches in localStorage', async () => {
      vi.mocked(cashApi.openShift).mockResolvedValue({
        success: true,
        shift: mockShift,
        idempotentReplay: false,
      });

      // Preset tenant/location context
      useCashStore.setState({ activeTenantId: 'tenant-1', activeLocationId: 'loc-1' });

      const success = await useCashStore.getState().openShift(500000, context);

      expect(success).toBe(true);
      const state = useCashStore.getState();
      expect(state.activeShift).toEqual(mockShift);
      expect(state.lastClosedShift).toBeNull();
      expect(state.isSubmitting).toBe(false);
      expect(state.error).toBeNull();

      expect(cashApi.openShift).toHaveBeenCalledWith(
        expect.objectContaining({
          openingAmountCents: 500000,
          idempotencyKey: expect.any(String),
        })
      );

      const cached = window.localStorage.getItem('pulso_cached_shift_tenant-1_loc-1');
      expect(JSON.parse(cached!)).toEqual(mockShift);
    });

    it('handles openShift error and records error message', async () => {
      vi.mocked(cashApi.openShift).mockRejectedValue(
        new Error('Ya existe un turno abierto en esta sucursal')
      );

      const success = await useCashStore.getState().openShift(500000, context);

      expect(success).toBe(false);
      const state = useCashStore.getState();
      expect(state.activeShift).toBeNull();
      expect(state.isSubmitting).toBe(false);
      expect(state.error).toBe('Ya existe un turno abierto en esta sucursal');
    });

    it('blocks duplicate concurrent openShift requests', async () => {
      useCashStore.setState({ isSubmitting: true });

      const success = await useCashStore.getState().openShift(500000, context);

      expect(success).toBe(false);
      expect(cashApi.openShift).not.toHaveBeenCalled();
    });
  });

  describe('sensitive mutation guard', () => {
    const mutations = [
      {
        invoke: (requestContext: typeof context) =>
          useCashStore.getState().registerCashIn(1000, 'Cambio', requestContext),
        api: () => cashApi.registerCashIn,
      },
      {
        invoke: (requestContext: typeof context) =>
          useCashStore.getState().registerCashOut(1000, 'Proveedor', requestContext),
        api: () => cashApi.registerCashOut,
      },
      {
        invoke: (requestContext: typeof context) =>
          useCashStore.getState().closeShift(500000, undefined, requestContext),
        api: () => cashApi.closeShift,
      },
    ];
    const rejectionCases: Array<
      [Partial<ReturnType<typeof useCashStore.getState>>, typeof context]
    > = [
      [{ isSubmitting: true }, context],
      [{ isActiveShiftConfirmed: false }, context],
      [{ activeShift: null }, context],
      [{ activeShift: { ...mockShift, status: 'CLOSED' as const } }, context],
      [{ activeTenantId: 'tenant-2' }, context],
      [{ activeLocationId: 'loc-2' }, context],
      [{ activeShift: { ...mockShift, tenantId: 'tenant-2' } }, context],
      [{ activeShift: { ...mockShift, locationId: 'loc-2' } }, context],
      [{}, { ...context, locationId: 'loc-2' }],
    ];

    it('rejects every ineligible state across all sensitive mutations', async () => {
      for (const [state, requestContext] of rejectionCases) {
        for (const { invoke, api } of mutations) {
          vi.clearAllMocks();
          useCashStore.setState({
            activeShift: mockShift,
            isActiveShiftConfirmed: true,
            activeTenantId: context.tenantId,
            activeLocationId: context.locationId,
            isSubmitting: false,
            error: null,
            ...state,
          });

          const success = await invoke(requestContext);

          expect(success).toBe(false);
          expect(api()).not.toHaveBeenCalled();
          expect(useCashStore.getState().error).toBe(safeMutationGuardError);
        }
      }
    });
  });

  describe('registerCashIn & registerCashOut', () => {
    it('registers manual cash in and updates activeShift', async () => {
      const updatedShift: CashShiftResponse = {
        ...mockShift,
        expectedAmountCents: 600000,
        summary: {
          ...mockShift.summary!,
          cashInAmountCents: 100000,
          expectedAmountCents: 600000,
          movementsCount: 2,
        },
      };

      vi.mocked(cashApi.registerCashIn).mockResolvedValue({
        success: true,
        movement: {} as unknown as CashMovementResponse,
        shift: updatedShift,
        idempotentReplay: false,
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage secret');
      });

      useCashStore.setState({
        activeShift: mockShift,
        isActiveShiftConfirmed: true,
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore
        .getState()
        .registerCashIn(100000, 'Ingreso para cambio', context);

      expect(success).toBe(true);
      expect(useCashStore.getState().activeShift).toEqual(updatedShift);
      expect(useCashStore.getState().isSubmitting).toBe(false);

      expect(cashApi.registerCashIn).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 100000,
          reason: 'Ingreso para cambio',
          idempotencyKey: expect.any(String),
        })
      );
      expect(cashApi.registerCashIn).toHaveBeenCalledTimes(1);
      expect(useCashStore.getState().isActiveShiftConfirmed).toBe(true);
    });

    it('registers manual cash out and updates activeShift', async () => {
      const updatedShift: CashShiftResponse = {
        ...mockShift,
        expectedAmountCents: 450000,
        summary: {
          ...mockShift.summary!,
          cashOutAmountCents: 50000,
          expectedAmountCents: 450000,
          movementsCount: 2,
        },
      };

      vi.mocked(cashApi.registerCashOut).mockResolvedValue({
        success: true,
        movement: {} as unknown as CashMovementResponse,
        shift: updatedShift,
        idempotentReplay: false,
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('storage secret');
      });

      useCashStore.setState({
        activeShift: mockShift,
        isActiveShiftConfirmed: true,
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore
        .getState()
        .registerCashOut(50000, 'Pago a proveedor', context);

      expect(success).toBe(true);
      expect(useCashStore.getState().activeShift).toEqual(updatedShift);
      expect(cashApi.registerCashOut).toHaveBeenCalledTimes(1);
      expect(useCashStore.getState().isActiveShiftConfirmed).toBe(true);
    });

    it('records error when cash out exceeds expected balance', async () => {
      vi.mocked(cashApi.registerCashOut).mockRejectedValue(
        new Error('Saldo insuficiente para realizar el retiro de efectivo')
      );

      useCashStore.setState({
        activeShift: mockShift,
        isActiveShiftConfirmed: true,
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore
        .getState()
        .registerCashOut(900000, 'Retiro excesivo', context);

      expect(success).toBe(false);
      expect(useCashStore.getState().error).toBe(
        'Saldo insuficiente para realizar el retiro de efectivo'
      );
    });

    it('does not simulate local success when registerCashIn fails or network is unavailable', async () => {
      vi.mocked(cashApi.registerCashIn).mockRejectedValue(new Error('Network offline'));

      useCashStore.setState({
        activeShift: mockShift,
        isActiveShiftConfirmed: true,
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore
        .getState()
        .registerCashIn(50000, 'Intento offline sin server', context);

      expect(success).toBe(false);
      // activeShift remains unmodified (no optimistic / fake local balance increase)
      expect(useCashStore.getState().activeShift).toEqual(mockShift);
      expect(useCashStore.getState().error).toBe('Network offline');
    });
  });

  describe('closeShift', () => {
    it('closes shift, nullifies activeShift, sets lastClosedShift, and removes cache', async () => {
      const closedShift: CashShiftResponse = {
        ...mockShift,
        status: 'CLOSED',
        countedAmountCents: 500000,
        differenceAmountCents: 0,
        closedAtUtc: '2026-09-06T18:00:00.000Z',
      };

      vi.mocked(cashApi.closeShift).mockResolvedValue({
        success: true,
        shift: closedShift,
        idempotentReplay: false,
      });

      window.localStorage.setItem('pulso_cached_shift_tenant-1_loc-1', JSON.stringify(mockShift));

      useCashStore.setState({
        activeShift: mockShift,
        isActiveShiftConfirmed: true,
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore.getState().closeShift(500000, undefined, context);

      expect(success).toBe(true);
      const state = useCashStore.getState();
      expect(state.activeShift).toBeNull();
      expect(state.lastClosedShift).toEqual(closedShift);
      expect(state.isActiveShiftConfirmed).toBe(false);
      expect(state.isSubmitting).toBe(false);
      expect(cashApi.closeShift).toHaveBeenCalledTimes(1);
      expect(cashApi.closeShift).toHaveBeenCalledWith(
        expect.objectContaining({ countedAmountCents: 500000, motivo: undefined })
      );

      const cached = window.localStorage.getItem('pulso_cached_shift_tenant-1_loc-1');
      expect(cached).toBeNull();
    });

    it('handles closeShift failure gracefully', async () => {
      vi.mocked(cashApi.closeShift).mockRejectedValue(new Error('Conflicto al cerrar turno'));

      useCashStore.setState({
        activeShift: mockShift,
        isActiveShiftConfirmed: true,
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore.getState().closeShift(500000, undefined, context);

      expect(success).toBe(false);
      expect(useCashStore.getState().error).toBe('Conflicto al cerrar turno');
    });
  });

  describe('loadShiftHistory & loadShiftDetail', () => {
    it('loads shift history with pagination parameters', async () => {
      vi.mocked(cashApi.fetchShifts).mockResolvedValue({
        items: [mockShift],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });

      await useCashStore.getState().loadShiftHistory(context, { page: 1, limit: 10 });

      const state = useCashStore.getState();
      expect(state.shiftHistory).toHaveLength(1);
      expect(state.historyTotal).toBe(1);
      expect(state.isLoadingHistory).toBe(false);
      expect(state.historyError).toBeNull();
    });

    it('loads shift detail by id', async () => {
      const shiftDetail: CashShiftResponse = {
        ...mockShift,
        movements: [
          {
            id: 'mov-1',
            tenantId: 'tenant-1',
            locationId: 'loc-1',
            shiftId: 'shift-100',
            createdByUserId: 'u-1',
            type: 'OPENING',
            amountCents: 500000,
            signedAmountCents: 500000,
            reason: 'Apertura de turno',
            saleId: null,
            idempotencyKey: 'idemp-1',
            createdAtUtc: '2026-09-06T12:00:00.000Z',
          },
        ],
      };

      vi.mocked(cashApi.fetchShiftById).mockResolvedValue(shiftDetail);

      await useCashStore.getState().loadShiftDetail('shift-100', context);

      const state = useCashStore.getState();
      expect(state.selectedShiftDetail).toEqual(shiftDetail);
      expect(state.isLoadingDetail).toBe(false);

      useCashStore.getState().closeShiftDetail();
      expect(useCashStore.getState().selectedShiftDetail).toBeNull();
    });
  });

  describe('clearCashSession & dismissLastClosedSummary', () => {
    it('clears all session-dependent data and increments request IDs', () => {
      useCashStore.setState({
        activeShift: mockShift,
        lastClosedShift: mockShift,
        shiftHistory: [mockShift],
        selectedShiftDetail: mockShift,
        error: 'Some error',
        shiftRequestId: 1,
        historyRequestId: 1,
        detailRequestId: 1,
      });

      useCashStore.getState().clearCashSession();

      const state = useCashStore.getState();
      expect(state.activeShift).toBeNull();
      expect(state.lastClosedShift).toBeNull();
      expect(state.shiftHistory).toEqual([]);
      expect(state.selectedShiftDetail).toBeNull();
      expect(state.error).toBeNull();
      expect(state.shiftRequestId).toBe(2);
      expect(state.historyRequestId).toBe(2);
      expect(state.detailRequestId).toBe(2);
    });

    it('dismisses last closed summary', () => {
      useCashStore.setState({ lastClosedShift: mockShift });
      useCashStore.getState().dismissLastClosedSummary();
      expect(useCashStore.getState().lastClosedShift).toBeNull();
    });
  });
});
