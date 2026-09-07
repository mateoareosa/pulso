import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useCashStore } from '../src/features/cash/store/cash.store';
import { cashApi } from '../src/features/cash/services/cash-api';
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
    expectedAmountCents: 500000,
    movementsCount: 1,
    salesCount: 0,
  },
  createdAt: '2026-09-06T12:00:00.000Z',
  updatedAt: '2026-09-06T12:00:00.000Z',
};

const context = { tenantId: 'tenant-1', locationId: 'loc-1' };

describe('useCashStore - Cash Shift Lifecycle & Session Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useCashStore.getState().clearCashSession();
  });

  afterEach(() => {
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

    it('falls back to cached shift in localStorage when network request fails', async () => {
      window.localStorage.setItem('pulso_cached_shift_tenant-1_loc-1', JSON.stringify(mockShift));
      vi.mocked(cashApi.fetchActiveShift).mockRejectedValue(new Error('Network error'));

      await useCashStore.getState().loadActiveShift(context);

      const state = useCashStore.getState();
      expect(state.activeShift).toEqual(mockShift);
      expect(state.error).toBe('Network error');
      expect(state.isLoadingActive).toBe(false);
    });

    it('protects against stale responses from previous requests', async () => {
      let resolveFirst: (val: CashShiftResponse | null) => void = () => {};
      vi.mocked(cashApi.fetchActiveShift).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      );

      // Launch first request for loc-1
      const promise1 = useCashStore.getState().loadActiveShift({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });

      // Switch context to loc-2 and launch second request
      const shift2: CashShiftResponse = { ...mockShift, locationId: 'loc-2' };
      vi.mocked(cashApi.fetchActiveShift).mockResolvedValueOnce(shift2);

      await useCashStore.getState().loadActiveShift({
        tenantId: 'tenant-1',
        locationId: 'loc-2',
      });

      expect(useCashStore.getState().activeShift?.locationId).toBe('loc-2');

      // Now resolve first request
      resolveFirst(mockShift);
      await promise1;

      // Must NOT overwrite loc-2 with stale loc-1 response
      expect(useCashStore.getState().activeShift?.locationId).toBe('loc-2');
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

      useCashStore.setState({
        activeShift: mockShift,
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

      useCashStore.setState({
        activeShift: mockShift,
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore
        .getState()
        .registerCashOut(50000, 'Pago a proveedor', context);

      expect(success).toBe(true);
      expect(useCashStore.getState().activeShift).toEqual(updatedShift);
    });

    it('records error when cash out exceeds expected balance', async () => {
      vi.mocked(cashApi.registerCashOut).mockRejectedValue(
        new Error('Saldo insuficiente para realizar el retiro de efectivo')
      );

      useCashStore.setState({
        activeShift: mockShift,
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
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore.getState().closeShift(500000, context);

      expect(success).toBe(true);
      const state = useCashStore.getState();
      expect(state.activeShift).toBeNull();
      expect(state.lastClosedShift).toEqual(closedShift);
      expect(state.isSubmitting).toBe(false);

      const cached = window.localStorage.getItem('pulso_cached_shift_tenant-1_loc-1');
      expect(cached).toBeNull();
    });

    it('handles closeShift failure gracefully', async () => {
      vi.mocked(cashApi.closeShift).mockRejectedValue(new Error('Conflicto al cerrar turno'));

      useCashStore.setState({
        activeShift: mockShift,
        activeTenantId: 'tenant-1',
        activeLocationId: 'loc-1',
      });

      const success = await useCashStore.getState().closeShift(500000, context);

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
