import { create } from 'zustand';
import { Money, IdempotencyKey } from '@pulso/domain';
import type { CreateSaleCommand } from '@pulso/contracts';
import { offlineDb } from '../../sync/offline-db';

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
}

interface SalesState {
  items: CartItem[];
  connectionStatus: 'online' | 'offline' | 'syncing';
  pendingSyncCount: number;
  isTenderOpen: boolean;
  lastSaleSuccess: SaleSuccessInfo | null;
  errorMessage: string | null;
  selectedItemId: string | null;

  // Actions
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
  setConnectionStatus: (status: 'online' | 'offline' | 'syncing') => void;
  toggleConnection: () => void;
  refreshPendingCount: () => Promise<void>;

  processCashPayment: (receivedCents: number, changeCents: number) => Promise<void>;
  syncPendingSales: () => Promise<void>;
  dismissSuccess: () => void;
  dismissError: () => void;
  setErrorMessage: (msg: string | null) => void;
}

export const useSalesStore = create<SalesState>((set, get) => ({
  items: [],
  connectionStatus: 'online',
  pendingSyncCount: 0,
  isTenderOpen: false,
  lastSaleSuccess: null,
  errorMessage: null,
  selectedItemId: null,

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

  refreshPendingCount: async () => {
    const count = await offlineDb.getPendingCount();
    set({ pendingSyncCount: count });
  },

  processCashPayment: async (receivedCents, changeCents) => {
    const state = get();
    const totalCents = state.items.reduce((acc, it) => acc + it.totalPriceCents, 0);
    const idempotencyKey = IdempotencyKey.generate().value;

    const saleCommand: CreateSaleCommand = {
      tenantId: 'tenant-pulso-01',
      locationId: 'loc-central',
      shiftId: 'shift-turn-14',
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

    const isOffline = state.connectionStatus === 'offline';

    // Store in offline IndexedDB queue
    await offlineDb.enqueueSale(saleCommand);
    const count = await offlineDb.getPendingCount();

    if (!isOffline) {
      // Simulate direct online settlement
      await offlineDb.markSynced(saleCommand.idempotencyKey);
      const afterCount = await offlineDb.getPendingCount();
      set({ pendingSyncCount: afterCount });
    } else {
      set({ pendingSyncCount: count });
    }

    set({
      items: [],
      isTenderOpen: false,
      lastSaleSuccess: {
        saleId: `SALE-${idempotencyKey.slice(0, 8).toUpperCase()}`,
        idempotencyKey,
        totalFormatted: Money.fromCents(totalCents).format(),
        paidFormatted: Money.fromCents(receivedCents).format(),
        changeFormatted: Money.fromCents(changeCents).format(),
        isOffline,
      },
    });
  },

  syncPendingSales: async () => {
    const state = get();
    if (state.pendingSyncCount === 0) return;

    set({ connectionStatus: 'syncing' });

    const pending = await offlineDb.getAllPending();
    for (const op of pending) {
      // Replay to backend
      await offlineDb.markSynced(op.operationId);
    }

    const remaining = await offlineDb.getPendingCount();
    set({
      connectionStatus: 'online',
      pendingSyncCount: remaining,
    });
  },

  dismissSuccess: () => set({ lastSaleSuccess: null }),
  dismissError: () => set({ errorMessage: null }),
  setErrorMessage: (msg) => set({ errorMessage: msg }),
}));
