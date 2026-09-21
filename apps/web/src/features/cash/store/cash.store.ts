import { create } from 'zustand';
import { cashApi } from '../services/cash-api';
import {
  CashShiftResponseSchema,
  type CashShiftResponse,
  type QueryCashShifts,
} from '@pulso/contracts';
import { ApiError, NetworkError } from '../../../services/api-client';

interface CashSessionContext {
  tenantId: string;
  locationId: string;
}

interface CashState {
  activeShift: CashShiftResponse | null;
  isActiveShiftConfirmed: boolean;
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
  closeShift: (
    countedAmountCents: number,
    motivo: string | undefined,
    context: CashSessionContext
  ) => Promise<boolean>;
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

const ACTIVE_LOAD_OFFLINE_ERROR =
  'Sin conexión con el servidor. No se pudo confirmar el estado de caja.';
const ACTIVE_LOAD_UNAUTHORIZED_ERROR = 'No tenés autorización para operar esta caja.';
const ACTIVE_LOAD_EXPIRED_SESSION_ERROR = 'Tu sesión venció. Iniciá sesión nuevamente.';
const ACTIVE_LOAD_GENERIC_ERROR = 'No se pudo confirmar el estado de caja. Reintentá.';
const ACTIVE_MUTATION_GUARD_ERROR =
  'No se puede modificar la caja hasta confirmar un turno abierto para esta sucursal.';

function removeCachedShift(context: CashSessionContext): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.removeItem(getCachedShiftKey(context.tenantId, context.locationId));
  } catch {
    // Cache is best-effort and must never replace authoritative state.
  }
}

function writeCachedShift(context: CashSessionContext, shift: CashShiftResponse | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (shift) {
      window.localStorage?.setItem(
        getCachedShiftKey(context.tenantId, context.locationId),
        JSON.stringify(shift)
      );
      return;
    }
  } catch {
    return;
  }

  removeCachedShift(context);
}

function readCachedOpenShift(context: CashSessionContext): CashShiftResponse | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.localStorage?.getItem(getCachedShiftKey(context.tenantId, context.locationId));
  } catch {
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = CashShiftResponseSchema.safeParse(JSON.parse(raw));
    if (
      parsed.success &&
      parsed.data.status === 'OPEN' &&
      parsed.data.tenantId === context.tenantId &&
      parsed.data.locationId === context.locationId
    ) {
      return parsed.data;
    }
  } catch {
    // Invalid JSON is handled like every other invalid cache entry.
  }

  removeCachedShift(context);
  return null;
}

function isCurrentActiveRequest(
  state: CashState,
  requestId: number,
  context: CashSessionContext
): boolean {
  return (
    state.shiftRequestId === requestId &&
    state.activeTenantId === context.tenantId &&
    state.activeLocationId === context.locationId
  );
}

function mapActiveLoadError(error: unknown): string {
  if (error instanceof NetworkError) return ACTIVE_LOAD_OFFLINE_ERROR;
  if (error instanceof ApiError && error.status === 401) return ACTIVE_LOAD_EXPIRED_SESSION_ERROR;
  if (error instanceof ApiError && error.status === 403) return ACTIVE_LOAD_UNAUTHORIZED_ERROR;
  return ACTIVE_LOAD_GENERIC_ERROR;
}

function canMutateActiveShift(state: CashState, context: CashSessionContext): boolean {
  const shift = state.activeShift;
  return (
    !state.isSubmitting &&
    state.isActiveShiftConfirmed &&
    shift !== null &&
    shift.status === 'OPEN' &&
    state.activeTenantId === context.tenantId &&
    state.activeLocationId === context.locationId &&
    shift.tenantId === context.tenantId &&
    shift.locationId === context.locationId
  );
}

export const useCashStore = create<CashState>((set, get) => ({
  activeShift: null,
  isActiveShiftConfirmed: false,
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
    const currentState = get();
    const currentRequestId = currentState.shiftRequestId + 1;
    const contextChanged =
      currentState.activeTenantId !== context.tenantId ||
      currentState.activeLocationId !== context.locationId;
    set({
      shiftRequestId: currentRequestId,
      activeTenantId: context.tenantId,
      activeLocationId: context.locationId,
      activeShift: contextChanged ? null : currentState.activeShift,
      isActiveShiftConfirmed: false,
      lastClosedShift: contextChanged ? null : currentState.lastClosedShift,
      isLoadingActive: true,
      error: null,
    });

    try {
      const shift = await cashApi.fetchActiveShift();

      if (!isCurrentActiveRequest(get(), currentRequestId, context)) return;

      set({
        activeShift: shift,
        isActiveShiftConfirmed: true,
        isLoadingActive: false,
      });
      writeCachedShift(context, shift);
    } catch (err: unknown) {
      if (!isCurrentActiveRequest(get(), currentRequestId, context)) return;

      if (err instanceof NetworkError) {
        set({
          activeShift: readCachedOpenShift(context),
          isActiveShiftConfirmed: false,
          isLoadingActive: false,
          error: mapActiveLoadError(err),
        });
        return;
      }

      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        removeCachedShift(context);
        set({
          activeShift: null,
          isActiveShiftConfirmed: false,
          isLoadingActive: false,
          error: mapActiveLoadError(err),
        });
        return;
      }

      set({
        isActiveShiftConfirmed: false,
        isLoadingActive: false,
        error: mapActiveLoadError(err),
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
          isActiveShiftConfirmed: true,
          lastClosedShift: null,
          isSubmitting: false,
        });
        writeCachedShift(context, res.shift);
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
    if (!canMutateActiveShift(get(), context)) {
      set({ error: ACTIVE_MUTATION_GUARD_ERROR });
      return false;
    }
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
          isActiveShiftConfirmed: true,
          isSubmitting: false,
        });
        writeCachedShift(context, res.shift);
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
    if (!canMutateActiveShift(get(), context)) {
      set({ error: ACTIVE_MUTATION_GUARD_ERROR });
      return false;
    }
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
          isActiveShiftConfirmed: true,
          isSubmitting: false,
        });
        writeCachedShift(context, res.shift);
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

  closeShift: async (
    countedAmountCents: number,
    motivo: string | undefined,
    context: CashSessionContext
  ) => {
    if (!canMutateActiveShift(get(), context)) {
      set({ error: ACTIVE_MUTATION_GUARD_ERROR });
      return false;
    }
    set({ isSubmitting: true, error: null });

    try {
      const idempotencyKey = crypto.randomUUID();
      const res = await cashApi.closeShift({
        countedAmountCents,
        motivo,
        idempotencyKey,
      });

      if (
        get().activeTenantId === context.tenantId &&
        get().activeLocationId === context.locationId
      ) {
        set({
          activeShift: null,
          isActiveShiftConfirmed: false,
          lastClosedShift: res.shift,
          isSubmitting: false,
        });
        removeCachedShift(context);
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
      isActiveShiftConfirmed: false,
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
