import { create } from 'zustand';
import { purchasesApi } from '../services/purchases-api';
import { ApiError } from '../../../services/api-client';
import type {
  SupplierResponse,
  PurchaseResponse,
  PurchaseDetailResponse,
  QuerySuppliers,
  QueryPurchases,
  CreateSupplierCommand,
  UpdateSupplierCommand,
  CreatePurchaseDraftCommand,
  UpdatePurchaseDraftCommand,
  ReceivePurchaseCommand,
  CancelPurchaseCommand,
} from '@pulso/contracts';

type PurchasesPermissionRole = 'OWNER' | 'MANAGER' | 'CASHIER';

interface PurchasesContextIdentity {
  tenantId: string;
  locationId: string;
  permissionRole: PurchasesPermissionRole;
}

interface PurchasesSessionContext {
  tenantId: string;
  locationId: string;
  ownerKey?: string;
}

export interface OwnedPurchasesContext extends PurchasesContextIdentity {
  permissionEpoch: number;
  ownerKey: string;
}

export type VersionedUpdatePurchaseDraftCommand = UpdatePurchaseDraftCommand & { version: number };

const unavailableMessage = (error: unknown) => {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 404) return 'La compra ya no está disponible en la sucursal actual.';
  if (error.status === 409)
    return 'Otra operación modificó o cerró este borrador. Actualizamos el listado.';
  return null;
};

const isReceiveConflict = (error: unknown) => error instanceof ApiError && error.status === 409;

const mutationKey = (context: PurchasesSessionContext, id: string, version: number | undefined) =>
  `${context.ownerKey ?? `${context.tenantId}::${context.locationId}`}::${id}::${version ?? 'unknown'}`;

const ownsContext = (state: PurchasesState, context: PurchasesSessionContext) =>
  state.activeTenantId === context.tenantId &&
  state.activeLocationId === context.locationId &&
  (context.ownerKey === undefined ? true : state.activeContextKey === context.ownerKey);

const resolveOwnedContext = (
  state: PurchasesState,
  context: PurchasesSessionContext
): PurchasesSessionContext | null => {
  if (state.activeContextKey === null) {
    return null;
  }
  const owned = { ...context, ownerKey: context.ownerKey ?? state.activeContextKey };
  return ownsContext(state, owned) && state.activePermissionRole !== 'CASHIER' ? owned : null;
};

const isCurrentMutationContext = (
  state: PurchasesState,
  context: PurchasesSessionContext,
  mutationRequestId: number,
  ownerKey: string | null,
  role: PurchasesPermissionRole | null,
  permissionEpoch: number
) =>
  Boolean(context.ownerKey) &&
  state.activeContextKey === ownerKey &&
  state.activePermissionRole === role &&
  state.permissionEpoch === permissionEpoch &&
  state.mutationRequestId === mutationRequestId &&
  state.activeTenantId === context.tenantId &&
  state.activeLocationId === context.locationId;

interface PurchasesState {
  // Suppliers
  suppliers: SupplierResponse[];
  suppliersTotal: number;
  suppliersPage: number;
  suppliersLimit: number;
  suppliersTotalPages: number;
  isLoadingSuppliers: boolean;
  suppliersError: string | null;

  // Purchases
  purchases: PurchaseResponse[];
  purchasesTotal: number;
  purchasesPage: number;
  purchasesLimit: number;
  purchasesTotalPages: number;
  isLoadingPurchases: boolean;
  purchasesError: string | null;

  // Selected Detail
  selectedPurchase: PurchaseDetailResponse | null;
  isLoadingDetail: boolean;
  detailError: string | null;

  // Submission state
  isSubmitting: boolean;
  actionError: string | null;

  // Session & concurrency guard
  activeTenantId: string | null;
  activeLocationId: string | null;
  activePermissionRole: PurchasesPermissionRole | null;
  permissionEpoch: number;
  activeContextKey: string | null;
  suppliersOwnerKey: string | null;
  purchasesOwnerKey: string | null;
  detailOwnerKey: string | null;
  receiveIntentKey: string | null;
  receiveConflict: boolean;
  suppliersRequestId: number;
  purchasesRequestId: number;
  detailRequestId: number;
  mutationRequestId: number;
  activeMutationKey: string | null;

  transitionPurchasesContext: (identity: PurchasesContextIdentity) => OwnedPurchasesContext;
  prepareReceiveIntent: () => string;

  // Actions - Suppliers
  loadSuppliers: (
    context: PurchasesSessionContext,
    params?: Partial<QuerySuppliers>
  ) => Promise<void>;
  createSupplier: (
    dto: CreateSupplierCommand,
    context: PurchasesSessionContext
  ) => Promise<SupplierResponse | null>;
  updateSupplier: (
    id: string,
    dto: UpdateSupplierCommand,
    context: PurchasesSessionContext
  ) => Promise<boolean>;
  toggleSupplierStatus: (
    id: string,
    isActive: boolean,
    context: PurchasesSessionContext
  ) => Promise<boolean>;

  // Actions - Purchases
  loadPurchases: (
    context: PurchasesSessionContext,
    params?: Partial<QueryPurchases>
  ) => Promise<void>;
  loadPurchaseDetail: (id: string, context: PurchasesSessionContext) => Promise<void>;
  closePurchaseDetail: () => void;
  createDraft: (
    dto: CreatePurchaseDraftCommand,
    context: PurchasesSessionContext
  ) => Promise<PurchaseDetailResponse | null>;
  updateDraft: (
    id: string,
    dto: VersionedUpdatePurchaseDraftCommand,
    context: PurchasesSessionContext
  ) => Promise<PurchaseDetailResponse | null>;
  receivePurchase: (
    id: string,
    dto: ReceivePurchaseCommand,
    context: PurchasesSessionContext
  ) => Promise<boolean>;
  cancelPurchase: (
    id: string,
    dto: CancelPurchaseCommand,
    context: PurchasesSessionContext
  ) => Promise<boolean>;

  clearPurchasesSession: () => void;
  clearActionError: () => void;
}

export const usePurchasesStore = create<PurchasesState>((set, get) => ({
  suppliers: [],
  suppliersTotal: 0,
  suppliersPage: 1,
  suppliersLimit: 20,
  suppliersTotalPages: 1,
  isLoadingSuppliers: false,
  suppliersError: null,

  purchases: [],
  purchasesTotal: 0,
  purchasesPage: 1,
  purchasesLimit: 20,
  purchasesTotalPages: 1,
  isLoadingPurchases: false,
  purchasesError: null,

  selectedPurchase: null,
  isLoadingDetail: false,
  detailError: null,

  isSubmitting: false,
  actionError: null,

  activeTenantId: null,
  activeLocationId: null,
  activePermissionRole: null,
  permissionEpoch: 0,
  activeContextKey: null,
  suppliersOwnerKey: null,
  purchasesOwnerKey: null,
  detailOwnerKey: null,
  receiveIntentKey: null,
  receiveConflict: false,
  suppliersRequestId: 0,
  purchasesRequestId: 0,
  detailRequestId: 0,
  mutationRequestId: 0,
  activeMutationKey: null,

  transitionPurchasesContext: (identity) => {
    const state = get();
    const permissionEpoch = state.permissionEpoch + 1;
    const ownerKey = `${identity.tenantId}::${identity.locationId}::${identity.permissionRole}::${permissionEpoch}`;
    set({
      suppliers: [],
      suppliersTotal: 0,
      suppliersPage: 1,
      suppliersLimit: 20,
      suppliersTotalPages: 1,
      isLoadingSuppliers: false,
      suppliersError: null,
      purchases: [],
      purchasesTotal: 0,
      purchasesPage: 1,
      purchasesLimit: 20,
      purchasesTotalPages: 1,
      isLoadingPurchases: false,
      purchasesError: null,
      selectedPurchase: null,
      isLoadingDetail: false,
      detailError: null,
      isSubmitting: false,
      actionError: null,
      activeTenantId: identity.tenantId,
      activeLocationId: identity.locationId,
      activePermissionRole: identity.permissionRole,
      permissionEpoch,
      activeContextKey: ownerKey,
      suppliersOwnerKey: null,
      purchasesOwnerKey: null,
      detailOwnerKey: null,
      receiveIntentKey: null,
      suppliersRequestId: state.suppliersRequestId + 1,
      purchasesRequestId: state.purchasesRequestId + 1,
      detailRequestId: state.detailRequestId + 1,
      mutationRequestId: state.mutationRequestId + 1,
      activeMutationKey: null,
    });
    return { ...identity, permissionEpoch, ownerKey };
  },

  prepareReceiveIntent: () => {
    const existing = get().receiveIntentKey;
    if (existing) return existing;
    const intent = crypto.randomUUID();
    set({ receiveIntentKey: intent });
    return intent;
  },

  loadSuppliers: async (context: PurchasesSessionContext, params?: Partial<QuerySuppliers>) => {
    const ownedContext = resolveOwnedContext(get(), context);
    if (!ownedContext) return;
    const currentRequestId = get().suppliersRequestId + 1;
    set({
      suppliersRequestId: currentRequestId,
      suppliers: [],
      suppliersTotal: 0,
      suppliersOwnerKey: null,
      isLoadingSuppliers: true,
      suppliersError: null,
    });

    try {
      const res = await purchasesApi.fetchSuppliers(params);

      if (get().suppliersRequestId !== currentRequestId || !ownsContext(get(), ownedContext)) {
        return; // stale response protection
      }

      set({
        suppliers: res.items,
        suppliersTotal: res.total,
        suppliersPage: res.page,
        suppliersLimit: res.limit,
        suppliersTotalPages: res.totalPages,
        suppliersOwnerKey: ownedContext.ownerKey ?? null,
        isLoadingSuppliers: false,
      });
    } catch (err: unknown) {
      if (get().suppliersRequestId !== currentRequestId || !ownsContext(get(), ownedContext)) {
        return;
      }
      set({
        isLoadingSuppliers: false,
        suppliersError: err instanceof Error ? err.message : 'Error al cargar proveedores',
      });
    }
  },

  createSupplier: async (dto: CreateSupplierCommand, context: PurchasesSessionContext) => {
    const initial = get();
    if (initial.isSubmitting || !context.ownerKey || initial.activeContextKey !== context.ownerKey)
      return null;
    const mutationRequestId = initial.mutationRequestId + 1;
    const ownerKey = initial.activeContextKey;
    const role = initial.activePermissionRole;
    const permissionEpoch = initial.permissionEpoch;
    set({ isSubmitting: true, actionError: null, mutationRequestId, activeMutationKey: ownerKey });

    try {
      const created = await purchasesApi.createSupplier(dto);
      if (
        isCurrentMutationContext(get(), context, mutationRequestId, ownerKey, role, permissionEpoch)
      ) {
        set((state) => ({
          suppliers: [created, ...state.suppliers],
          suppliersTotal: state.suppliersTotal + 1,
          isSubmitting: false,
        }));
      } else {
        return null;
      }
      return created;
    } catch (err: unknown) {
      if (
        isCurrentMutationContext(get(), context, mutationRequestId, ownerKey, role, permissionEpoch)
      )
        set({
          isSubmitting: false,
          activeMutationKey: null,
          actionError: err instanceof Error ? err.message : 'Error al crear proveedor',
        });
      return null;
    }
  },

  updateSupplier: async (
    id: string,
    dto: UpdateSupplierCommand,
    context: PurchasesSessionContext
  ) => {
    const initial = get();
    if (initial.isSubmitting || !context.ownerKey || initial.activeContextKey !== context.ownerKey)
      return false;
    const mutationRequestId = initial.mutationRequestId + 1;
    const ownerKey = initial.activeContextKey;
    const role = initial.activePermissionRole;
    const permissionEpoch = initial.permissionEpoch;
    set({ isSubmitting: true, actionError: null, mutationRequestId, activeMutationKey: ownerKey });

    try {
      const updated = await purchasesApi.updateSupplier(id, dto);
      if (
        isCurrentMutationContext(get(), context, mutationRequestId, ownerKey, role, permissionEpoch)
      ) {
        set((state) => ({
          suppliers: state.suppliers.map((s) => (s.id === id ? updated : s)),
          isSubmitting: false,
        }));
      } else {
        return false;
      }
      return true;
    } catch (err: unknown) {
      if (
        isCurrentMutationContext(get(), context, mutationRequestId, ownerKey, role, permissionEpoch)
      )
        set({
          isSubmitting: false,
          activeMutationKey: null,
          actionError: err instanceof Error ? err.message : 'Error al actualizar proveedor',
        });
      return false;
    }
  },

  toggleSupplierStatus: async (id: string, isActive: boolean, context: PurchasesSessionContext) => {
    const initial = get();
    if (initial.isSubmitting || !context.ownerKey || initial.activeContextKey !== context.ownerKey)
      return false;
    const mutationRequestId = initial.mutationRequestId + 1;
    const ownerKey = initial.activeContextKey;
    const role = initial.activePermissionRole;
    const permissionEpoch = initial.permissionEpoch;
    set({ isSubmitting: true, actionError: null, mutationRequestId, activeMutationKey: ownerKey });

    try {
      const updated = await purchasesApi.toggleSupplierStatus(id, isActive);
      if (
        isCurrentMutationContext(get(), context, mutationRequestId, ownerKey, role, permissionEpoch)
      ) {
        set((state) => ({
          suppliers: state.suppliers.map((s) => (s.id === id ? updated : s)),
          isSubmitting: false,
        }));
      } else {
        return false;
      }
      return true;
    } catch (err: unknown) {
      if (
        isCurrentMutationContext(get(), context, mutationRequestId, ownerKey, role, permissionEpoch)
      )
        set({
          isSubmitting: false,
          activeMutationKey: null,
          actionError: err instanceof Error ? err.message : 'Error al cambiar estado del proveedor',
        });
      return false;
    }
  },

  loadPurchases: async (context: PurchasesSessionContext, params?: Partial<QueryPurchases>) => {
    const ownedContext = resolveOwnedContext(get(), context);
    if (!ownedContext) return;
    const currentRequestId = get().purchasesRequestId + 1;
    set({
      purchasesRequestId: currentRequestId,
      purchases: [],
      purchasesTotal: 0,
      purchasesOwnerKey: null,
      isLoadingPurchases: true,
      purchasesError: null,
    });

    try {
      const res = await purchasesApi.fetchPurchases(params);

      if (get().purchasesRequestId !== currentRequestId || !ownsContext(get(), ownedContext)) {
        return;
      }

      set({
        purchases: res.items,
        purchasesTotal: res.total,
        purchasesPage: res.page,
        purchasesLimit: res.limit,
        purchasesTotalPages: res.totalPages,
        purchasesOwnerKey: ownedContext.ownerKey ?? null,
        isLoadingPurchases: false,
      });
    } catch (err: unknown) {
      if (get().purchasesRequestId !== currentRequestId || !ownsContext(get(), ownedContext)) {
        return;
      }
      set({
        isLoadingPurchases: false,
        purchasesError: err instanceof Error ? err.message : 'Error al cargar compras',
      });
    }
  },

  loadPurchaseDetail: async (id: string, context: PurchasesSessionContext) => {
    const ownedContext = resolveOwnedContext(get(), context);
    if (!ownedContext) return;
    const currentRequestId = get().detailRequestId + 1;
    set({
      detailRequestId: currentRequestId,
      selectedPurchase: null,
      detailOwnerKey: null,
      isLoadingDetail: true,
      detailError: null,
    });

    try {
      const res = await purchasesApi.fetchPurchaseById(id);

      if (get().detailRequestId !== currentRequestId || !ownsContext(get(), ownedContext)) {
        return;
      }

      set({
        selectedPurchase: res,
        detailOwnerKey: ownedContext.ownerKey ?? null,
        isLoadingDetail: false,
      });
    } catch (err: unknown) {
      if (get().detailRequestId !== currentRequestId || !ownsContext(get(), ownedContext)) {
        return;
      }
      set({
        isLoadingDetail: false,
        selectedPurchase: null,
        detailOwnerKey: null,
        detailError:
          unavailableMessage(err) ??
          (err instanceof Error ? err.message : 'Error al cargar detalle de compra'),
      });
    }
  },

  closePurchaseDetail: () => {
    set({
      selectedPurchase: null,
      detailOwnerKey: null,
      detailError: null,
      receiveIntentKey: null,
    });
  },

  createDraft: async (dto: CreatePurchaseDraftCommand, context: PurchasesSessionContext) => {
    const initial = get();
    const ownedContext = resolveOwnedContext(initial, context);
    if (!ownedContext) return null;
    context = ownedContext;
    if (
      initial.isSubmitting ||
      (initial.activeTenantId !== null && initial.activeTenantId !== context.tenantId) ||
      (initial.activeLocationId !== null && initial.activeLocationId !== context.locationId)
    )
      return null;
    const currentRequestId = initial.mutationRequestId + 1;
    const currentMutationKey = mutationKey(context, 'new', undefined);
    set({
      isSubmitting: true,
      actionError: null,
      mutationRequestId: currentRequestId,
      activeMutationKey: currentMutationKey,
      activeTenantId: initial.activeTenantId ?? context.tenantId,
      activeLocationId: initial.activeLocationId ?? context.locationId,
    });
    const isCurrent = () =>
      get().mutationRequestId === currentRequestId &&
      get().activeMutationKey === currentMutationKey &&
      get().activeTenantId === context.tenantId &&
      get().activeLocationId === context.locationId;

    try {
      const created = await purchasesApi.createDraft(dto);
      if (isCurrent()) {
        set((state) => ({
          purchases: [created, ...state.purchases],
          purchasesTotal: state.purchasesTotal + 1,
          isSubmitting: false,
          activeMutationKey: null,
        }));
        return created;
      }
      return null;
    } catch (err: unknown) {
      if (!isCurrent()) return null;
      set({
        isSubmitting: false,
        activeMutationKey: null,
        actionError: err instanceof Error ? err.message : 'Error al crear borrador de compra',
      });
      return null;
    }
  },

  updateDraft: async (
    id: string,
    dto: VersionedUpdatePurchaseDraftCommand,
    context: PurchasesSessionContext
  ) => {
    const initial = get();
    const ownedContext = resolveOwnedContext(initial, context);
    if (!ownedContext) return null;
    context = ownedContext;
    if (
      initial.isSubmitting ||
      (initial.activeTenantId !== null && initial.activeTenantId !== context.tenantId) ||
      (initial.activeLocationId !== null && initial.activeLocationId !== context.locationId)
    )
      return null;
    const currentRequestId = initial.mutationRequestId + 1;
    const currentMutationKey = mutationKey(context, id, dto.version);
    const selectedVersionAtStart =
      initial.selectedPurchase?.id === id ? initial.selectedPurchase.version : undefined;
    set({
      isSubmitting: true,
      actionError: null,
      receiveConflict: false,
      mutationRequestId: currentRequestId,
      activeMutationKey: currentMutationKey,
      activeTenantId: initial.activeTenantId ?? context.tenantId,
      activeLocationId: initial.activeLocationId ?? context.locationId,
    });
    const isCurrent = (checkSelectedVersion = true) => {
      const state = get();
      return (
        state.mutationRequestId === currentRequestId &&
        state.activeMutationKey === currentMutationKey &&
        state.activeTenantId === context.tenantId &&
        state.activeLocationId === context.locationId &&
        (!checkSelectedVersion ||
          selectedVersionAtStart === undefined ||
          (state.selectedPurchase?.id === id &&
            state.selectedPurchase.version === selectedVersionAtStart))
      );
    };

    try {
      const updated = await purchasesApi.updateDraft(id, dto);
      if (!isCurrent()) {
        if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
        return null;
      }
      set((state) => ({
        purchases: state.purchases.map((p) => (p.id === id ? updated : p)),
        selectedPurchase: state.selectedPurchase?.id === id ? updated : state.selectedPurchase,
      }));
      await get().loadPurchases(context);
      if (!isCurrent(false)) return null;
      set({ isSubmitting: false, activeMutationKey: null });
      return updated;
    } catch (err: unknown) {
      if (!isCurrent()) {
        if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
        return null;
      }
      const recoveryMessage = unavailableMessage(err);
      set({
        actionError:
          recoveryMessage ??
          (err instanceof Error ? err.message : 'Error al actualizar borrador de compra'),
        selectedPurchase:
          recoveryMessage && get().selectedPurchase?.id === id ? null : get().selectedPurchase,
        receiveIntentKey: recoveryMessage ? null : get().receiveIntentKey,
      });
      if (recoveryMessage) await get().loadPurchases(context);
      if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
      return null;
    }
  },

  receivePurchase: async (
    id: string,
    dto: ReceivePurchaseCommand,
    context: PurchasesSessionContext
  ) => {
    const initial = get();
    const ownedContext = resolveOwnedContext(initial, context);
    if (!ownedContext) return false;
    context = ownedContext;
    if (
      initial.isSubmitting ||
      (initial.activeTenantId !== null && initial.activeTenantId !== context.tenantId) ||
      (initial.activeLocationId !== null && initial.activeLocationId !== context.locationId)
    )
      return false;
    const selectedVersion =
      initial.selectedPurchase?.id === id ? initial.selectedPurchase.version : undefined;
    const currentRequestId = initial.mutationRequestId + 1;
    const currentMutationKey = mutationKey(context, id, selectedVersion);
    set({
      isSubmitting: true,
      actionError: null,
      receiveConflict: false,
      mutationRequestId: currentRequestId,
      activeMutationKey: currentMutationKey,
      activeTenantId: initial.activeTenantId ?? context.tenantId,
      activeLocationId: initial.activeLocationId ?? context.locationId,
    });
    const isCurrent = (checkSelectedVersion = true) => {
      const state = get();
      return (
        state.mutationRequestId === currentRequestId &&
        state.activeMutationKey === currentMutationKey &&
        state.activeTenantId === context.tenantId &&
        state.activeLocationId === context.locationId &&
        (!checkSelectedVersion ||
          selectedVersion === undefined ||
          (state.selectedPurchase?.id === id && state.selectedPurchase.version === selectedVersion))
      );
    };

    try {
      const res = await purchasesApi.receivePurchase(id, dto);
      if (!isCurrent()) {
        if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
        return false;
      }
      set((state) => ({
        purchases: state.purchases.map((p) => (p.id === id ? res.purchase : p)),
        selectedPurchase: state.selectedPurchase?.id === id ? null : state.selectedPurchase,
        detailOwnerKey: state.selectedPurchase?.id === id ? null : state.detailOwnerKey,
        receiveIntentKey: null,
      }));
      await get().loadPurchases(context);
      if (!isCurrent(false)) return false;
      set({ isSubmitting: false, activeMutationKey: null });
      return true;
    } catch (err: unknown) {
      if (!isCurrent()) {
        if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
        return false;
      }
      const recoveryMessage = unavailableMessage(err);
      set({
        actionError:
          recoveryMessage ?? (err instanceof Error ? err.message : 'Error al recibir compra'),
        selectedPurchase:
          recoveryMessage &&
          !isReceiveConflict(err) &&
          get().selectedPurchase?.id === id
            ? null
            : get().selectedPurchase,
        receiveIntentKey: recoveryMessage ? null : get().receiveIntentKey,
        receiveConflict: isReceiveConflict(err),
      });
      if (recoveryMessage) await get().loadPurchases(context);
      if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
      return false;
    }
  },

  cancelPurchase: async (
    id: string,
    dto: CancelPurchaseCommand,
    context: PurchasesSessionContext
  ) => {
    const initial = get();
    const ownedContext = resolveOwnedContext(initial, context);
    if (!ownedContext) return false;
    context = ownedContext;
    if (
      initial.isSubmitting ||
      (initial.activeTenantId !== null && initial.activeTenantId !== context.tenantId) ||
      (initial.activeLocationId !== null && initial.activeLocationId !== context.locationId)
    )
      return false;
    const selectedVersion =
      initial.selectedPurchase?.id === id ? initial.selectedPurchase.version : undefined;
    const currentRequestId = initial.mutationRequestId + 1;
    const currentMutationKey = mutationKey(context, id, selectedVersion);
    set({
      isSubmitting: true,
      actionError: null,
      mutationRequestId: currentRequestId,
      activeMutationKey: currentMutationKey,
      activeTenantId: initial.activeTenantId ?? context.tenantId,
      activeLocationId: initial.activeLocationId ?? context.locationId,
    });
    const isCurrent = (checkSelectedVersion = true) => {
      const state = get();
      return (
        state.mutationRequestId === currentRequestId &&
        state.activeMutationKey === currentMutationKey &&
        state.activeTenantId === context.tenantId &&
        state.activeLocationId === context.locationId &&
        (!checkSelectedVersion ||
          selectedVersion === undefined ||
          (state.selectedPurchase?.id === id && state.selectedPurchase.version === selectedVersion))
      );
    };

    try {
      const cancelled = await purchasesApi.cancelPurchase(id, dto);
      if (!isCurrent()) {
        if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
        return false;
      }
      set((state) => ({
        purchases: state.purchases.map((p) => (p.id === id ? cancelled : p)),
        selectedPurchase: state.selectedPurchase?.id === id ? cancelled : state.selectedPurchase,
      }));
      await get().loadPurchases(context);
      if (!isCurrent(false)) return false;
      set({ isSubmitting: false, activeMutationKey: null });
      return true;
    } catch (err: unknown) {
      if (!isCurrent()) {
        if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
        return false;
      }
      const recoveryMessage = unavailableMessage(err);
      set({
        actionError:
          recoveryMessage ?? (err instanceof Error ? err.message : 'Error al cancelar compra'),
        selectedPurchase:
          recoveryMessage && get().selectedPurchase?.id === id ? null : get().selectedPurchase,
      });
      if (recoveryMessage) await get().loadPurchases(context);
      if (isCurrent(false)) set({ isSubmitting: false, activeMutationKey: null });
      return false;
    }
  },

  clearPurchasesSession: () => {
    set((state) => ({
      suppliers: [],
      suppliersTotal: 0,
      suppliersPage: 1,
      suppliersLimit: 20,
      suppliersTotalPages: 1,
      isLoadingSuppliers: false,
      suppliersError: null,

      purchases: [],
      purchasesTotal: 0,
      purchasesPage: 1,
      purchasesLimit: 20,
      purchasesTotalPages: 1,
      isLoadingPurchases: false,
      purchasesError: null,

      selectedPurchase: null,
      isLoadingDetail: false,
      detailError: null,

      isSubmitting: false,
      actionError: null,

      activeTenantId: null,
      activeLocationId: null,
      activePermissionRole: null,
      activeContextKey: null,
      permissionEpoch: 0,
      suppliersOwnerKey: null,
      purchasesOwnerKey: null,
      detailOwnerKey: null,
      receiveIntentKey: null,
      suppliersRequestId: state.suppliersRequestId + 1,
      purchasesRequestId: state.purchasesRequestId + 1,
      detailRequestId: state.detailRequestId + 1,
      mutationRequestId: state.mutationRequestId + 1,
      activeMutationKey: null,
    }));
  },

  clearActionError: () => {
    set({ actionError: null, suppliersError: null, purchasesError: null, detailError: null });
  },
}));
