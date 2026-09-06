import { create } from 'zustand';
import { Money, IdempotencyKey } from '@pulso/domain';
import {
  parseSalesDateRange,
  type CreateSaleCommand,
  type SaleResponse,
  type SaleWarning,
  type SyncBatch,
} from '@pulso/contracts';
import { offlineDb, type PendingSyncRecord } from '../../sync/offline-db';
import { salesApi } from '../services/sales-api';
import { NetworkError, ApiError } from '../../../services/api-client';

export interface LocalSalesFilterOptions {
  search?: string;
  from?: string;
  to?: string;
}

export function parseDateRange(
  from?: string,
  to?: string
): {
  fromMillis?: number;
  toExclusiveMillis?: number;
} {
  const { fromUtc, toExclusiveUtc } = parseSalesDateRange(from, to);
  return {
    fromMillis: fromUtc?.getTime(),
    toExclusiveMillis: toExclusiveUtc?.getTime(),
  };
}

export function filterAndMapLocalSales(
  records: PendingSyncRecord[],
  filters: LocalSalesFilterOptions,
  excludeKeys?: Set<string>
): SaleResponse[] {
  const { search, from, to } = filters;
  const { fromMillis, toExclusiveMillis } = parseDateRange(from, to);

  const matching = records.filter((rec) => {
    if (
      excludeKeys &&
      (excludeKeys.has(rec.operationId) || excludeKeys.has(rec.payload.idempotencyKey))
    ) {
      return false;
    }

    if (search) {
      const q = search.toLowerCase().trim();
      const localId = `local-${rec.operationId.slice(0, 8)}`.toLowerCase();
      const opId = rec.operationId.toLowerCase();
      const idem = rec.payload.idempotencyKey.toLowerCase();
      const matchesId = localId.includes(q) || opId.includes(q) || idem.includes(q);
      const matchesProduct = rec.payload.items.some(
        (it) =>
          it.name.toLowerCase().includes(q) || (it.barcode && it.barcode.toLowerCase().includes(q))
      );
      if (!matchesId && !matchesProduct) return false;
    }

    const effectiveCreatedAt = rec.payload.createdAtUtc || rec.createdAt;
    const recTime = new Date(effectiveCreatedAt).getTime();
    if (fromMillis !== undefined && recTime < fromMillis) return false;
    if (toExclusiveMillis !== undefined && recTime >= toExclusiveMillis) return false;

    return true;
  });

  matching.sort((a, b) => {
    const timeA = new Date(a.payload.createdAtUtc || a.createdAt).getTime();
    const timeB = new Date(b.payload.createdAtUtc || b.createdAt).getTime();
    const diff = timeB - timeA;
    return diff !== 0 ? diff : b.operationId.localeCompare(a.operationId);
  });

  return matching.map((p) => {
    const effectiveCreatedAt = p.payload.createdAtUtc || p.createdAt;
    return {
      id: `local-${p.operationId.slice(0, 8)}`,
      tenantId: p.tenantId,
      locationId: p.locationId,
      userId: 'local-cashier',
      shiftId: p.payload.shiftId ?? null,
      idempotencyKey: p.payload.idempotencyKey,
      totalCents: p.payload.totalCents,
      status: p.status,
      lastError: p.lastError ?? null,
      createdAtUtc: effectiveCreatedAt,
      persistedAt: effectiveCreatedAt,
      items: p.payload.items.map((it, idx) => ({
        id: `item-${idx}`,
        saleId: `local-${p.operationId.slice(0, 8)}`,
        productId: it.productId,
        name: it.name,
        barcode: it.barcode ?? null,
        quantity: it.quantity.toString(),
        unitPriceCents: it.unitPriceCents,
        totalPriceCents: it.totalPriceCents,
      })),
      tenders: p.payload.tenders.map((t, idx) => ({
        id: `tender-${idx}`,
        saleId: `local-${p.operationId.slice(0, 8)}`,
        type: t.type,
        amountCents: t.amountCents,
        receivedAmountCents: t.receivedAmountCents ?? null,
        changeAmountCents: t.changeAmountCents ?? null,
        reference: t.reference ?? null,
      })),
    };
  });
}

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  barcode?: string;
  quantity: number;
  unitPriceCents: number;
  totalPriceCents: number;
}

export interface SaleSuccessInfo {
  saleId: string;
  idempotencyKey: string;
  totalFormatted: string;
  paidFormatted: string;
  changeFormatted: string;
  isOffline: boolean;
  warnings?: SaleWarning[];
}

interface SalesState {
  items: CartItem[];
  connectionStatus: 'online' | 'offline' | 'syncing' | 'error';
  pendingSyncCount: number;
  quarantinedCount: number;
  isTenderOpen: boolean;
  lastSaleSuccess: SaleSuccessInfo | null;
  errorMessage: string | null;
  syncErrorMessage: string | null;
  selectedItemId: string | null;
  isSubmittingSale: boolean;

  // Sales History State
  salesHistory: SaleResponse[];
  localSalesHistory: SaleResponse[];
  salesTotal: number;
  salesPage: number;
  salesLimit: number;
  salesTotalPages: number;
  isSalesHistoryLoading: boolean;
  salesHistoryError: string | null;
  selectedSaleDetail: SaleResponse | null;
  isDetailLoading: boolean;

  // Session & Generation Guard
  activeTenantId: string | null;
  activeLocationId: string | null;
  historyGeneration: number;
  historyRequestId: number;
  detailRequestId: number;

  // Cart Actions
  addItem: (product: {
    productId: string;
    name: string;
    barcode?: string;
    unitPriceCents: number;
  }) => void;
  updateQuantity: (id: string, delta: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  setSelectedItemId: (id: string | null) => void;

  openTender: () => void;
  closeTender: () => void;
  setConnectionStatus: (status: 'online' | 'offline' | 'syncing' | 'error') => void;
  toggleConnection: () => void;
  refreshPendingCount: (context?: { tenantId?: string; locationId?: string }) => Promise<void>;
  recoverQuarantinedOperations: (explicitContext?: {
    tenantId: string;
    locationId: string;
  }) => Promise<{ recovered: number; ambiguous: number; blocked: boolean; reason?: string }>;

  processCashPayment: (
    receivedCents: number,
    changeCents: number,
    context?: { tenantId?: string; locationId?: string; shiftId?: string }
  ) => Promise<void>;
  syncPendingSales: (context?: { tenantId?: string; locationId?: string }) => Promise<void>;
  retryOfflineSale: (
    context: { tenantId: string; locationId: string },
    operationId: string
  ) => Promise<void>;
  dismissSuccess: () => void;
  dismissError: () => void;
  setErrorMessage: (msg: string | null) => void;

  // History Actions
  loadSalesHistory: (params?: {
    tenantId?: string;
    locationId?: string;
    page?: number;
    limit?: number;
    from?: string;
    to?: string;
    search?: string;
  }) => Promise<void>;
  loadSaleDetail: (
    id: string,
    context?: { tenantId?: string; locationId?: string }
  ) => Promise<void>;
  closeSaleDetail: () => void;
  clearSalesSession: () => void;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  items: [],
  connectionStatus: 'online',
  pendingSyncCount: 0,
  quarantinedCount: 0,
  isTenderOpen: false,
  lastSaleSuccess: null,
  errorMessage: null,
  syncErrorMessage: null,
  selectedItemId: null,
  isSubmittingSale: false,

  salesHistory: [],
  localSalesHistory: [],
  salesTotal: 0,
  salesPage: 1,
  salesLimit: 20,
  salesTotalPages: 1,
  isSalesHistoryLoading: false,
  salesHistoryError: null,
  selectedSaleDetail: null,
  isDetailLoading: false,

  activeTenantId: null,
  activeLocationId: null,
  historyGeneration: 0,
  historyRequestId: 0,
  detailRequestId: 0,

  addItem: (product) => {
    set((state) => {
      const existingIdx = state.items.findIndex((it) => it.productId === product.productId);
      if (existingIdx >= 0) {
        const updated = [...state.items];
        const item = updated[existingIdx]!;
        const nextQty = item.quantity + 1;
        const total = Money.fromCents(item.unitPriceCents).multiply(nextQty).cents;
        updated[existingIdx] = {
          ...item,
          quantity: nextQty,
          totalPriceCents: total,
        };
        return { items: updated, selectedItemId: item.id };
      }

      const newItem: CartItem = {
        id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        productId: product.productId,
        name: product.name,
        barcode: product.barcode,
        quantity: 1,
        unitPriceCents: product.unitPriceCents,
        totalPriceCents: product.unitPriceCents,
      };
      return { items: [...state.items, newItem], selectedItemId: newItem.id };
    });
  },

  updateQuantity: (id, delta) => {
    set((state) => {
      const updated = state.items
        .map((it) => {
          if (it.id !== id) return it;
          const nextQty = it.quantity + delta;
          if (nextQty <= 0) return null;
          return {
            ...it,
            quantity: nextQty,
            totalPriceCents: Money.fromCents(it.unitPriceCents).multiply(nextQty).cents,
          };
        })
        .filter((it): it is CartItem => it !== null);

      return { items: updated };
    });
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((it) => it.id !== id),
      selectedItemId: state.selectedItemId === id ? null : state.selectedItemId,
    }));
  },

  clearCart: () => {
    set({ items: [], selectedItemId: null, isTenderOpen: false });
  },

  setSelectedItemId: (id) => set({ selectedItemId: id }),

  openTender: () => {
    if (get().items.length === 0) return;
    set({ isTenderOpen: true });
  },

  closeTender: () => set({ isTenderOpen: false }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  toggleConnection: () => {
    const current = get().connectionStatus;
    const next = current === 'online' ? 'offline' : 'online';
    set({ connectionStatus: next });
  },

  refreshPendingCount: async (context) => {
    const quarantined = await offlineDb.getQuarantinedCount().catch(() => 0);
    if (context?.tenantId && context?.locationId) {
      const count = await offlineDb.getPendingCount(context.tenantId, context.locationId);
      set({ pendingSyncCount: count, quarantinedCount: quarantined });
    } else {
      set({ pendingSyncCount: 0, quarantinedCount: quarantined });
    }
  },

  recoverQuarantinedOperations: async (explicitContext) => {
    const result = await offlineDb.recoverQuarantinedRecords(explicitContext);
    const quarantined = await offlineDb.getQuarantinedCount().catch(() => 0);
    set({ quarantinedCount: quarantined });
    if (explicitContext?.tenantId && explicitContext?.locationId) {
      const count = await offlineDb.getPendingCount(
        explicitContext.tenantId,
        explicitContext.locationId
      );
      set({ pendingSyncCount: count });
    }
    return result;
  },

  processCashPayment: async (receivedCents, changeCents, context) => {
    if (!context?.tenantId || !context?.locationId) {
      const errorMsg =
        'El contexto con tenantId y locationId es obligatorio para procesar la venta.';
      set({ errorMessage: errorMsg });
      throw new Error(errorMsg);
    }

    if (get().isSubmittingSale) {
      return;
    }
    set({ isSubmittingSale: true });

    try {
      const state = get();
      const totalCents = state.items.reduce((acc, it) => acc + it.totalPriceCents, 0);
      const idempotencyKey = IdempotencyKey.generate().value;

      const saleCommand: CreateSaleCommand = {
        shiftId: context.shiftId ?? undefined,
        idempotencyKey,
        items: state.items.map((it) => ({
          productId: it.productId,
          name: it.name,
          barcode: it.barcode,
          quantity: it.quantity,
          unitPriceCents: it.unitPriceCents,
          totalPriceCents: it.totalPriceCents,
        })),
        tenders: [
          {
            type: 'CASH',
            amountCents: totalCents,
            receivedAmountCents: receivedCents,
            changeAmountCents: changeCents,
          },
        ],
        totalCents,
        createdAtUtc: new Date().toISOString(),
      };

      const isExplicitOffline =
        state.connectionStatus === 'offline' ||
        (typeof navigator !== 'undefined' && !navigator.onLine);

      if (!isExplicitOffline) {
        try {
          const res = await salesApi.createSale(saleCommand);
          const serverSale = res.sale;
          set({
            items: [],
            isTenderOpen: false,
            lastSaleSuccess: {
              saleId: serverSale.id,
              idempotencyKey,
              totalFormatted: Money.fromCents(totalCents).format(),
              paidFormatted: Money.fromCents(receivedCents).format(),
              changeFormatted: Money.fromCents(changeCents).format(),
              isOffline: false,
              warnings: res.warnings,
            },
          });
          return;
        } catch (err: unknown) {
          const isNetworkErr =
            err instanceof NetworkError ||
            (err instanceof Error && err.name === 'NetworkError') ||
            (typeof navigator !== 'undefined' && !navigator.onLine);

          if (!isNetworkErr) {
            const errorMsg =
              err instanceof Error ? err.message : 'Error al procesar la venta en el servidor.';
            set({ errorMessage: errorMsg });
            throw err;
          }
          console.warn(
            'Network failure during online sale submission, falling back to offline queue:',
            err
          );
        }
      }

      // Offline mode or real network failure fallback
      await offlineDb.enqueueSaleWithStockDeduction(saleCommand, {
        tenantId: context.tenantId,
        locationId: context.locationId,
        deviceId: 'web-pos',
      });

      const count = await offlineDb.getPendingCount(context.tenantId, context.locationId);
      set({
        items: [],
        isTenderOpen: false,
        pendingSyncCount: count,
        lastSaleSuccess: {
          saleId: `SALE-${idempotencyKey.slice(0, 8).toUpperCase()}`,
          idempotencyKey,
          totalFormatted: Money.fromCents(totalCents).format(),
          paidFormatted: Money.fromCents(receivedCents).format(),
          changeFormatted: Money.fromCents(changeCents).format(),
          isOffline: true,
        },
      });
    } finally {
      set({ isSubmittingSale: false });
    }
  },

  syncPendingSales: async (context) => {
    if (!context?.tenantId || !context?.locationId) {
      return;
    }
    const { tenantId, locationId } = context;
    const pending = await offlineDb.getPendingSalesForLocation(tenantId, locationId);
    const toSync = pending.filter((op) => op.status === 'PENDING');

    if (toSync.length === 0) {
      const count = await offlineDb.getPendingCount(tenantId, locationId);
      set({ connectionStatus: 'online', pendingSyncCount: count, syncErrorMessage: null });
      return;
    }

    set({ connectionStatus: 'syncing', syncErrorMessage: null });

    try {
      const batch: SyncBatch = {
        deviceId: 'web-pos',
        operations: toSync.map((op) => ({
          operationId: op.operationId,
          type: 'CREATE_SALE' as const,
          payload: op.payload,
        })),
      };

      const syncResult = await salesApi.syncBatch(batch);
      for (const res of syncResult.results) {
        if (res.status === 'SYNCED') {
          await offlineDb.markSynced({ tenantId, locationId }, res.operationId);
        } else {
          await offlineDb.markFailedWithCompensation(
            { tenantId, locationId },
            res.operationId,
            res.error || 'Fallo al sincronizar con el servidor'
          );
        }
      }

      const remaining = await offlineDb.getPendingCount(tenantId, locationId);
      set({
        connectionStatus: 'online',
        pendingSyncCount: remaining,
        syncErrorMessage: null,
      });
    } catch (err: unknown) {
      const isNetworkErr =
        err instanceof NetworkError ||
        (err instanceof Error && err.name === 'NetworkError') ||
        (typeof navigator !== 'undefined' && !navigator.onLine);

      if (isNetworkErr) {
        set({
          connectionStatus: 'offline',
          syncErrorMessage: 'Modo sin conexión. Operaciones pendientes preservadas en cola.',
        });
        return;
      }

      const msg = err instanceof Error ? err.message : 'Error general al sincronizar el lote.';
      set({
        connectionStatus: 'error',
        syncErrorMessage: msg,
      });
    }
  },

  retryOfflineSale: async (context, operationId) => {
    if (!context?.tenantId || !context?.locationId) return;
    await offlineDb.retryFailedOperation(context, operationId);
    await get().refreshPendingCount(context);
    await get().syncPendingSales(context);
    await get().loadSalesHistory({ tenantId: context.tenantId, locationId: context.locationId });
  },

  loadSalesHistory: async (params) => {
    if (!params?.tenantId || !params?.locationId) {
      set({ salesHistory: [], localSalesHistory: [], salesTotal: 0, isSalesHistoryLoading: false });
      return;
    }
    const { tenantId, locationId, page = 1, limit = 20, from, to, search } = params;
    const currentGen = get().historyGeneration;
    const nextRequestId = get().historyRequestId + 1;

    // Reset detail if tenant or location changed
    if (get().activeTenantId !== tenantId || get().activeLocationId !== locationId) {
      set((state) => ({
        selectedSaleDetail: null,
        isDetailLoading: false,
        detailRequestId: state.detailRequestId + 1,
      }));
    }

    // Pre-validate date range if from or to are provided
    if ((from !== undefined && from !== '') || (to !== undefined && to !== '')) {
      try {
        parseSalesDateRange(from, to);
      } catch (validationErr: unknown) {
        const errorMsg =
          validationErr instanceof Error ? validationErr.message : 'Rango de fechas inválido.';
        set({
          activeTenantId: tenantId,
          activeLocationId: locationId,
          historyRequestId: nextRequestId,
          isSalesHistoryLoading: false,
          salesHistory: [],
          localSalesHistory: [],
          salesTotal: 0,
          salesHistoryError: errorMsg,
        });
        return;
      }
    }

    set({
      activeTenantId: tenantId,
      activeLocationId: locationId,
      historyRequestId: nextRequestId,
      isSalesHistoryLoading: true,
      salesHistoryError: null,
    });

    const isStale = () => {
      const state = get();
      return (
        state.historyGeneration !== currentGen ||
        state.historyRequestId !== nextRequestId ||
        state.activeTenantId !== tenantId ||
        state.activeLocationId !== locationId
      );
    };

    try {
      const serverData = await salesApi.fetchSales({
        page,
        limit,
        from,
        to,
        search,
      });

      if (isStale()) {
        return;
      }

      // Filter local pending / failed sales only on page 1 of history
      let filteredLocalSales: SaleResponse[] = [];
      if (page === 1) {
        const localRecords = await offlineDb.getPendingSalesForLocation(tenantId, locationId);
        if (isStale()) {
          return;
        }
        const serverKeys = new Set(serverData.items.map((s) => s.idempotencyKey));
        filteredLocalSales = filterAndMapLocalSales(localRecords, { from, to, search }, serverKeys);
      }

      if (isStale()) {
        return;
      }

      set({
        salesHistory: serverData.items,
        localSalesHistory: filteredLocalSales,
        salesTotal: serverData.total,
        salesPage: serverData.page,
        salesLimit: serverData.limit,
        salesTotalPages: serverData.totalPages,
        isSalesHistoryLoading: false,
      });
    } catch (err: unknown) {
      if (isStale()) {
        return;
      }

      if (err instanceof ApiError) {
        if (err.status === 401 || err.status === 403) {
          set({
            salesHistory: [],
            localSalesHistory: [],
            salesTotal: 0,
            salesPage: 1,
            salesLimit: limit,
            salesTotalPages: 1,
            isSalesHistoryLoading: false,
            selectedSaleDetail: null,
            salesHistoryError: 'Sesión expirada o no autorizada para consultar historial.',
          });
          return;
        }

        if (err.status === 400) {
          set({
            salesHistory: [],
            localSalesHistory: [],
            salesTotal: 0,
            salesPage: 1,
            salesLimit: limit,
            salesTotalPages: 1,
            isSalesHistoryLoading: false,
            salesHistoryError: err.message || 'Parámetros de búsqueda inválidos.',
          });
          return;
        }

        set({
          salesHistory: [],
          localSalesHistory: [],
          salesTotal: 0,
          salesPage: 1,
          salesLimit: limit,
          salesTotalPages: 1,
          isSalesHistoryLoading: false,
          salesHistoryError: err.message || 'Error interno del servidor al consultar el historial.',
        });
        return;
      }

      const isNetwork =
        err instanceof NetworkError ||
        (err instanceof Error && err.name === 'NetworkError') ||
        (typeof navigator !== 'undefined' && !navigator.onLine);

      if (isNetwork) {
        const localRecords = await offlineDb.getPendingSalesForLocation(tenantId, locationId);
        if (isStale()) {
          return;
        }

        const localSales = filterAndMapLocalSales(localRecords, { from, to, search });

        set({
          salesHistory: [],
          localSalesHistory: localSales,
          salesTotal: 0,
          salesPage: 1,
          salesLimit: limit,
          salesTotalPages: 1,
          isSalesHistoryLoading: false,
          salesHistoryError: 'Modo sin conexión. Mostrando operaciones locales pendientes.',
        });
        return;
      }

      const message =
        err instanceof Error ? err.message : 'Error inesperado al consultar el historial.';
      set({
        salesHistory: [],
        localSalesHistory: [],
        salesTotal: 0,
        salesPage: 1,
        salesLimit: limit,
        salesTotalPages: 1,
        isSalesHistoryLoading: false,
        salesHistoryError: message,
      });
    }
  },

  loadSaleDetail: async (id, context) => {
    const nextReqId = get().detailRequestId + 1;
    const currentGen = get().historyGeneration;
    const expectedTenantId = context?.tenantId ?? get().activeTenantId;
    const expectedLocationId = context?.locationId ?? get().activeLocationId;

    set({
      isDetailLoading: true,
      detailRequestId: nextReqId,
      selectedSaleDetail: null,
    });

    const isStale = () => {
      const state = get();
      return (
        state.historyGeneration !== currentGen ||
        state.detailRequestId !== nextReqId ||
        state.activeTenantId !== expectedTenantId ||
        state.activeLocationId !== expectedLocationId
      );
    };

    const localExisting = get().localSalesHistory.find((s) => s.id === id);
    if (localExisting && localExisting.items && localExisting.items.length > 0) {
      if (!isStale()) {
        set({ selectedSaleDetail: localExisting, isDetailLoading: false });
      }
      return;
    }

    const existing = get().salesHistory.find((s) => s.id === id);
    if (existing && existing.items && existing.items.length > 0) {
      if (!isStale()) {
        set({ selectedSaleDetail: existing, isDetailLoading: false });
      }
      return;
    }

    if (!id.startsWith('local-')) {
      try {
        const sale = await salesApi.fetchSaleById(id);
        if (isStale()) {
          return;
        }
        set({ selectedSaleDetail: sale, isDetailLoading: false });
      } catch {
        if (isStale()) {
          return;
        }
        set({ isDetailLoading: false });
      }
    } else {
      if (!isStale()) {
        set({ isDetailLoading: false });
      }
    }
  },

  closeSaleDetail: () =>
    set((state) => ({
      selectedSaleDetail: null,
      isDetailLoading: false,
      detailRequestId: state.detailRequestId + 1,
    })),

  clearSalesSession: () => {
    set((state) => ({
      items: [],
      connectionStatus: 'online',
      pendingSyncCount: 0,
      isTenderOpen: false,
      lastSaleSuccess: null,
      errorMessage: null,
      syncErrorMessage: null,
      selectedItemId: null,
      isSubmittingSale: false,
      salesHistory: [],
      localSalesHistory: [],
      salesTotal: 0,
      salesPage: 1,
      salesLimit: 20,
      salesTotalPages: 1,
      isSalesHistoryLoading: false,
      salesHistoryError: null,
      selectedSaleDetail: null,
      isDetailLoading: false,
      activeTenantId: null,
      activeLocationId: null,
      historyGeneration: state.historyGeneration + 1,
      historyRequestId: state.historyRequestId + 1,
      detailRequestId: state.detailRequestId + 1,
    }));
  },

  dismissSuccess: () => set({ lastSaleSuccess: null }),
  dismissError: () => set({ errorMessage: null }),
  setErrorMessage: (msg) => set({ errorMessage: msg }),
}));
