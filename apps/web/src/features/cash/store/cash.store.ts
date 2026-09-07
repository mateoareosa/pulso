import { create } from 'zustand';
import { cashApi } from '../services/cash-api';
import type { CashShiftResponse, QueryCashShifts } from '@pulso/contracts';

interface CashSessionContext {
  tenantId: string;
  locationId: string;
}

interface CashState {
  activeShift: CashShiftResponse | null;
  lastClosedShift: CashShiftResponse | null;
  isLoadingActive: boolean;
  isSubmitting: boolean;
  error: string | null;

  // History for Owner / Manager
  shiftHistory: CashShiftResponse[];
  historyTotal: number;
  historyPage: number;
  historyLimit: number;
  historyTotalPages: number;
  isLoadingHistory: boolean;
  historyError: string | null;

  // Detail Modal
  selectedShiftDetail: CashShiftResponse | null;
  isLoadingDetail: boolean;
  detailError: string | null;

  // Concurrency and Session Protection
  activeTenantId: string | null;
  activeLocationId: string | null;
  shiftRequestId: number;
  historyRequestId: number;
  detailRequestId: number;

  // Actions
  loadActiveShift: (context: CashSessionContext) => Promise<void>;
  openShift: (openingAmountCents: number, context: CashSessionContext) => Promise<boolean>;
  registerCashIn: (
    amountCents: number,
    reason: string,
    context: CashSessionContext
  ) => Promise<boolean>;
  registerCashOut: (
    amountCents: number,
    reason: string,
    context: CashSessionContext
  ) => Promise<boolean>;
  closeShift: (countedAmountCents: number, context: CashSessionContext) => Promise<boolean>;
  loadShiftHistory: (context: CashSessionContext, params?: QueryCashShifts) => Promise<void>;
  loadShiftDetail: (id: string, context: CashSessionContext) => Promise<void>;
  closeShiftDetail: () => void;
  dismissLastClosedSummary: () => void;
  clearCashSession: () => void;
  clearError: () => void;
}

function getCachedShiftKey(tenantId: string, locationId: string): string {
  return `pulso_cached_shift_${tenantId}_${locationId}`;
}

export const useCashStore = create<CashState>((set, get) => ({
  activeShift: null,
  lastClosedShift: null,
  isLoadingActive: false,
  isSubmitting: false,
  error: null,

  shiftHistory: [],
  historyTotal: 0,
  historyPage: 1,
  historyLimit: 10,
  historyTotalPages: 1,
  isLoadingHistory: false,
  historyError: null,

  selectedShiftDetail: null,
  isLoadingDetail: false,
  detailError: null,

  activeTenantId: null,
  activeLocationId: null,
  shiftRequestId: 0,
  historyRequestId: 0,
  detailRequestId: 0,

  loadActiveShift: async (context: CashSessionContext) => {
    const currentRequestId = get().shiftRequestId + 1;
    set({
      shiftRequestId: currentRequestId,
      activeTenantId: context.tenantId,
      activeLocationId: context.locationId,
      isLoadingActive: true,
      error: null,
    });

    try {
      const shift = await cashApi.fetchActiveShift();

      if (
        get().shiftRequestId !== currentRequestId ||
        get().activeTenantId !== context.tenantId ||
        get().activeLocationId !== context.locationId
      ) {
        return; // Stale write protection
      }

      // Cache for offline visual continuity
      if (typeof window !== 'undefined' && window.localStorage) {
        const key = getCachedShiftKey(context.tenantId, context.locationId);
        if (shift) {
          window.localStorage.setItem(key, JSON.stringify(shift));
        } else {
          window.localStorage.removeItem(key);
        }
      }

      set({ activeShift: shift, isLoadingActive: false });
    } catch (err: unknown) {
      if (
        get().shiftRequestId !== currentRequestId ||
        get().activeTenantId !== context.tenantId ||
        get().activeLocationId !== context.locationId
      ) {
        return;
      }

      // Fallback to cached shift if network fails
      let cached: CashShiftResponse | null = null;
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const raw = window.localStorage.getItem(
            getCachedShiftKey(context.tenantId, context.locationId)
          );
          if (raw) cached = JSON.parse(raw);
        } catch {
          // Ignore cache parse error
        }
      }

      set({
        activeShift: cached,
        isLoadingActive: false,
        error: err instanceof Error ? err.message : 'Error al consultar estado de caja',
      });
    }
  },

  openShift: async (openingAmountCents: number, context: CashSessionContext) => {
    if (get().isSubmitting) return false;
    set({ isSubmitting: true, error: null });

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await cashApi.openShift({
        openingAmountCents,
        idempotencyKey,
      });

      if (
        get().activeTenantId === context.tenantId &&
        get().activeLocationId === context.locationId
      ) {
        set({
          activeShift: res.shift,
          lastClosedShift: null,
          isSubmitting: false,
        });

        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(
            getCachedShiftKey(context.tenantId, context.locationId),
            JSON.stringify(res.shift)
          );
        }
      } else {
        set({ isSubmitting: false });
      }

      return true;
    } catch (err: unknown) {
      set({
        isSubmitting: false,
        error: err instanceof Error ? err.message : 'Error al abrir caja',
      });
      return false;
    }
  },

  registerCashIn: async (amountCents: number, reason: string, context: CashSessionContext) => {
    if (get().isSubmitting) return false;
    set({ isSubmitting: true, error: null });

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await cashApi.registerCashIn({
        amountCents,
        reason,
        idempotencyKey,
      });

      if (
        get().activeTenantId === context.tenantId &&
        get().activeLocationId === context.locationId
      ) {
        set({
          activeShift: res.shift,
          isSubmitting: false,
        });

        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(
            getCachedShiftKey(context.tenantId, context.locationId),
            JSON.stringify(res.shift)
          );
        }
      } else {
        set({ isSubmitting: false });
      }

      return true;
    } catch (err: unknown) {
      set({
        isSubmitting: false,
        error: err instanceof Error ? err.message : 'Error al registrar ingreso de efectivo',
      });
      return false;
    }
  },

  registerCashOut: async (amountCents: number, reason: string, context: CashSessionContext) => {
    if (get().isSubmitting) return false;
    set({ isSubmitting: true, error: null });

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await cashApi.registerCashOut({
        amountCents,
        reason,
        idempotencyKey,
      });

      if (
        get().activeTenantId === context.tenantId &&
        get().activeLocationId === context.locationId
      ) {
        set({
          activeShift: res.shift,
          isSubmitting: false,
        });

        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(
            getCachedShiftKey(context.tenantId, context.locationId),
            JSON.stringify(res.shift)
          );
        }
      } else {
        set({ isSubmitting: false });
      }

      return true;
    } catch (err: unknown) {
      set({
        isSubmitting: false,
        error: err instanceof Error ? err.message : 'Error al registrar retiro de efectivo',
      });
      return false;
    }
  },

  closeShift: async (countedAmountCents: number, context: CashSessionContext) => {
    if (get().isSubmitting) return false;
    set({ isSubmitting: true, error: null });

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await cashApi.closeShift({
        countedAmountCents,
        idempotencyKey,
      });

      if (
        get().activeTenantId === context.tenantId &&
        get().activeLocationId === context.locationId
      ) {
        set({
          activeShift: null,
          lastClosedShift: res.shift,
          isSubmitting: false,
        });

        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.removeItem(getCachedShiftKey(context.tenantId, context.locationId));
        }
      } else {
        set({ isSubmitting: false });
      }

      return true;
    } catch (err: unknown) {
      set({
        isSubmitting: false,
        error: err instanceof Error ? err.message : 'Error al cerrar caja',
      });
      return false;
    }
  },

  loadShiftHistory: async (context: CashSessionContext, params?: QueryCashShifts) => {
    const currentRequestId = get().historyRequestId + 1;
    set({
      historyRequestId: currentRequestId,
      activeTenantId: context.tenantId,
      activeLocationId: context.locationId,
      isLoadingHistory: true,
      historyError: null,
    });

    try {
      const res = await cashApi.fetchShifts({
        page: params?.page ?? get().historyPage,
        limit: params?.limit ?? get().historyLimit,
        from: params?.from,
        to: params?.to,
        status: params?.status,
      });

      if (
        get().historyRequestId !== currentRequestId ||
        get().activeTenantId !== context.tenantId ||
        get().activeLocationId !== context.locationId
      ) {
        return;
      }

      set({
        shiftHistory: res.items,
        historyTotal: res.total,
        historyPage: res.page,
        historyLimit: res.limit,
        historyTotalPages: res.totalPages,
        isLoadingHistory: false,
      });
    } catch (err: unknown) {
      if (
        get().historyRequestId !== currentRequestId ||
        get().activeTenantId !== context.tenantId ||
        get().activeLocationId !== context.locationId
      ) {
        return;
      }

      set({
        isLoadingHistory: false,
        historyError: err instanceof Error ? err.message : 'Error al cargar historial de turnos',
      });
    }
  },

  loadShiftDetail: async (id: string, context: CashSessionContext) => {
    const currentRequestId = get().detailRequestId + 1;
    set({
      detailRequestId: currentRequestId,
      activeTenantId: context.tenantId,
      activeLocationId: context.locationId,
      isLoadingDetail: true,
      detailError: null,
    });

    try {
      const shift = await cashApi.fetchShiftById(id);

      if (
        get().detailRequestId !== currentRequestId ||
        get().activeTenantId !== context.tenantId ||
        get().activeLocationId !== context.locationId
      ) {
        return;
      }

      set({ selectedShiftDetail: shift, isLoadingDetail: false });
    } catch (err: unknown) {
      if (
        get().detailRequestId !== currentRequestId ||
        get().activeTenantId !== context.tenantId ||
        get().activeLocationId !== context.locationId
      ) {
        return;
      }

      set({
        isLoadingDetail: false,
        detailError: err instanceof Error ? err.message : 'Error al cargar detalle del turno',
      });
    }
  },

  closeShiftDetail: () => {
    set({ selectedShiftDetail: null, detailError: null });
  },

  dismissLastClosedSummary: () => {
    set({ lastClosedShift: null });
  },

  clearCashSession: () => {
    set((state) => ({
      activeShift: null,
      lastClosedShift: null,
      isLoadingActive: false,
      isSubmitting: false,
      error: null,
      shiftHistory: [],
      historyTotal: 0,
      historyPage: 1,
      historyLimit: 10,
      historyTotalPages: 1,
      isLoadingHistory: false,
      historyError: null,
      selectedShiftDetail: null,
      isLoadingDetail: false,
      detailError: null,
      activeTenantId: null,
      activeLocationId: null,
      shiftRequestId: state.shiftRequestId + 1,
      historyRequestId: state.historyRequestId + 1,
      detailRequestId: state.detailRequestId + 1,
    }));
  },

  clearError: () => {
    set({ error: null, historyError: null, detailError: null });
  },
}));
