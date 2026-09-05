import { create } from 'zustand';
import type {
  ProductResponse,
  CategoryResponse,
  CreateProductCommand,
  UpdateProductCommand,
  UpdateLocationSettingsCommand,
  CreateStockAdjustmentCommand,
  CreateCategoryCommand,
} from '@pulso/contracts';
import { catalogApi } from '../services/catalog-api';
import { offlineDb, CachedProductRecord } from '../../sync/offline-db';

export interface CatalogProductItem {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  barcode?: string | null;
  sku?: string | null;
  salePriceCents: number;
  costPriceCents?: number | null;
  stockQuantity: string;
  minimumStock: string;
  quickSlot?: number | null;
  isActive: boolean;
  isAvailable: boolean;
  version: number;
}

export interface LoadCatalogOptions {
  isOffline?: boolean;
  status?: 'ALL' | 'ACTIVE' | 'INACTIVE';
  page?: number;
  limit?: number;
  q?: string;
  categoryId?: string | null;
}

interface CatalogState {
  products: CatalogProductItem[];
  quickProducts: CatalogProductItem[]; // Products assigned to slots 1..8
  categories: CategoryResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  searchQuery: string;
  selectedCategory: string | null;
  statusFilter: 'ALL' | 'ACTIVE' | 'INACTIVE';
  isLoading: boolean;
  error: string | null;
  isOffline: boolean;

  // Actions
  loadCatalog: (
    tenantId: string,
    locationId: string,
    options?: LoadCatalogOptions
  ) => Promise<void>;
  loadPosCatalog: (tenantId: string, locationId: string, isOffline?: boolean) => Promise<void>;
  loadQuickProducts: (tenantId: string, locationId: string, isOffline?: boolean) => Promise<void>;
  searchProducts: (
    tenantId: string,
    locationId: string,
    query: string,
    isOffline?: boolean
  ) => Promise<void>;
  searchPosProducts: (
    tenantId: string,
    locationId: string,
    query: string,
    isOffline?: boolean
  ) => Promise<CatalogProductItem[]>;
  syncAllAvailableProductsToOffline: (tenantId: string, locationId: string) => Promise<void>;
  setSearchQuery: (q: string) => void;
  setSelectedCategory: (catId: string | null) => void;
  setStatusFilter: (status: 'ALL' | 'ACTIVE' | 'INACTIVE') => void;
  setPage: (page: number) => void;
  loadCategories: (tenantId?: string, locationId?: string) => Promise<void>;
  createCategory: (
    dto: CreateCategoryCommand,
    tenantId?: string,
    locationId?: string
  ) => Promise<CategoryResponse>;
  createProduct: (
    tenantId: string,
    locationId: string,
    dto: CreateProductCommand
  ) => Promise<ProductResponse>;
  updateProduct: (
    tenantId: string,
    locationId: string,
    id: string,
    dto: UpdateProductCommand
  ) => Promise<ProductResponse>;
  updateLocationSettings: (
    tenantId: string,
    locationId: string,
    id: string,
    dto: UpdateLocationSettingsCommand
  ) => Promise<void>;
  adjustStock: (
    tenantId: string,
    locationId: string,
    id: string,
    dto: CreateStockAdjustmentCommand
  ) => Promise<void>;
  clearCatalog: () => void;
}

function mapResponseToItem(p: ProductResponse): CatalogProductItem {
  return {
    id: p.id,
    name: p.name,
    category: p.category?.name || 'SIN CATEGORÍA',
    categoryId: p.categoryId,
    barcode: p.barcode,
    sku: p.sku,
    salePriceCents: p.salePriceCents,
    costPriceCents: p.costPriceCents,
    stockQuantity: p.locationSettings?.stockQuantity ?? '0.0000',
    minimumStock: p.locationSettings?.minimumStock ?? '0.0000',
    quickSlot: p.locationSettings?.quickSlot ?? null,
    isActive: p.isActive,
    isAvailable: p.locationSettings ? p.locationSettings.isAvailable : false,
    version: p.locationSettings?.version ?? 1,
  };
}

function mapCachedToItem(c: CachedProductRecord): CatalogProductItem {
  return {
    id: c.id,
    name: c.name,
    category: c.categoryName || 'SIN CATEGORÍA',
    categoryId: c.categoryId,
    barcode: c.barcode,
    sku: c.sku,
    salePriceCents: c.salePriceCents,
    costPriceCents: c.costPriceCents,
    stockQuantity: c.stockQuantity,
    minimumStock: c.minimumStock ?? '0.0000',
    quickSlot: c.quickSlot,
    isActive: c.isActive,
    isAvailable: c.isAvailable,
    version: c.version ?? 1,
  };
}

let currentSessionGeneration = 0;
let activeTenantId: string | null = null;
let activeLocationId: string | null = null;
let latestAdminRequestId = 0;
let latestPosRequestId = 0;
let latestQuickRequestId = 0;
let latestSyncRequestId = 0;
let latestProductsWriterId = 0;
let latestCategoriesRequestId = 0;

function isRequestValid(
  generation: number,
  tenantId: string,
  locationId: string,
  requestId: number,
  latestRequestId: number
): boolean {
  if (generation !== currentSessionGeneration) return false;
  if (activeTenantId !== null && tenantId !== activeTenantId) return false;
  if (activeLocationId !== null && locationId !== activeLocationId) return false;
  if (requestId !== latestRequestId) return false;
  return true;
}

function isMutationValid(generation: number, tenantId: string, locationId: string): boolean {
  if (generation !== currentSessionGeneration) return false;
  if (activeTenantId === null || activeLocationId === null) return false;
  if (tenantId !== activeTenantId || locationId !== activeLocationId) return false;
  return true;
}

export const useCatalogStore = create<CatalogState>((set, get) => ({
  products: [],
  quickProducts: [],
  categories: [],
  total: 0,
  page: 1,
  limit: 50,
  totalPages: 1,
  searchQuery: '',
  selectedCategory: null,
  statusFilter: 'ALL',
  isLoading: false,
  error: null,
  isOffline: false,

  loadCatalog: async (tenantId: string, locationId: string, options?: LoadCatalogOptions) => {
    if (
      activeTenantId !== null &&
      (activeTenantId !== tenantId || activeLocationId !== locationId)
    ) {
      currentSessionGeneration++;
    }
    activeTenantId = tenantId;
    activeLocationId = locationId;
    const generation = currentSessionGeneration;
    const requestId = ++latestAdminRequestId;
    const productsWriterId = ++latestProductsWriterId;

    const isOffline = options?.isOffline ?? false;
    const status = options?.status ? options.status : get().statusFilter;
    const page = options?.page ? options.page : get().page;
    const limit = options?.limit ? options.limit : get().limit;
    const q = options?.q !== undefined ? options.q : get().searchQuery;
    const categoryId =
      options?.categoryId !== undefined ? options.categoryId : get().selectedCategory;

    set({ isLoading: true, error: null, isOffline });

    // Always fetch quick products independently
    get()
      .loadQuickProducts(tenantId, locationId, isOffline)
      .catch(() => {});

    if (isOffline) {
      try {
        const cached = await offlineDb.getCachedProducts(tenantId, locationId, {
          onlyActive: status === 'ACTIVE',
          onlyAvailable: false,
        });
        if (
          !isRequestValid(generation, tenantId, locationId, requestId, latestAdminRequestId) ||
          productsWriterId !== latestProductsWriterId
        ) {
          return;
        }
        const items = cached.map(mapCachedToItem);

        set({
          products: items,
          total: items.length,
          page: 1,
          totalPages: 1,
          isLoading: false,
        });
        return;
      } catch (err: unknown) {
        if (
          !isRequestValid(generation, tenantId, locationId, requestId, latestAdminRequestId) ||
          productsWriterId !== latestProductsWriterId
        ) {
          return;
        }
        set({
          error: (err as Error).message || 'Error al cargar catálogo offline',
          isLoading: false,
        });
        return;
      }
    }

    try {
      const [productsRes, categoriesRes] = await Promise.all([
        catalogApi.fetchProducts({
          page,
          limit,
          status,
          q: q || undefined,
          categoryId: categoryId || undefined,
        }),
        catalogApi.fetchCategories().catch(() => []),
      ]);

      if (
        !isRequestValid(generation, tenantId, locationId, requestId, latestAdminRequestId) ||
        productsWriterId !== latestProductsWriterId
      ) {
        return;
      }

      const items = productsRes.items.map(mapResponseToItem);

      // Trigger full sync of all vendible products in background
      get()
        .syncAllAvailableProductsToOffline(tenantId, locationId)
        .catch(() => {});

      set({
        products: items,
        categories: categoriesRes,
        total: productsRes.total,
        page: productsRes.page,
        limit: productsRes.limit,
        totalPages: productsRes.totalPages,
        isLoading: false,
      });
    } catch (err: unknown) {
      if (
        !isRequestValid(generation, tenantId, locationId, requestId, latestAdminRequestId) ||
        productsWriterId !== latestProductsWriterId
      ) {
        return;
      }

      // If network fails, attempt fallback to IndexedDB
      try {
        const cached = await offlineDb.getCachedProducts(tenantId, locationId, {
          onlyActive: true,
          onlyAvailable: true,
        });
        if (
          !isRequestValid(generation, tenantId, locationId, requestId, latestAdminRequestId) ||
          productsWriterId !== latestProductsWriterId
        ) {
          return;
        }
        if (cached.length > 0) {
          const items = cached.map(mapCachedToItem);
          set({
            products: items,
            total: items.length,
            totalPages: 1,
            isLoading: false,
            isOffline: true,
          });
          return;
        }
      } catch {
        // Fallback failed
      }

      if (
        !isRequestValid(generation, tenantId, locationId, requestId, latestAdminRequestId) ||
        productsWriterId !== latestProductsWriterId
      ) {
        return;
      }

      set({
        error: (err as Error).message || 'Error al sincronizar catálogo',
        isLoading: false,
      });
    }
  },

  loadPosCatalog: async (tenantId: string, locationId: string, isOffline = false) => {
    if (
      activeTenantId !== null &&
      (activeTenantId !== tenantId || activeLocationId !== locationId)
    ) {
      currentSessionGeneration++;
    }
    activeTenantId = tenantId;
    activeLocationId = locationId;
    const generation = currentSessionGeneration;
    const requestId = ++latestPosRequestId;
    const productsWriterId = ++latestProductsWriterId;

    set({ isLoading: true, error: null, isOffline });

    const quickPromise = get().loadQuickProducts(tenantId, locationId, isOffline);

    if (isOffline) {
      try {
        const [cached] = await Promise.all([
          offlineDb.getCachedProducts(tenantId, locationId, {
            onlyActive: true,
            onlyAvailable: true,
          }),
          quickPromise,
        ]);
        if (
          !isRequestValid(generation, tenantId, locationId, requestId, latestPosRequestId) ||
          productsWriterId !== latestProductsWriterId
        ) {
          return;
        }
        const items = cached.map(mapCachedToItem);
        set({
          products: items,
          isLoading: false,
        });
        return;
      } catch (err: unknown) {
        if (
          !isRequestValid(generation, tenantId, locationId, requestId, latestPosRequestId) ||
          productsWriterId !== latestProductsWriterId
        ) {
          return;
        }
        set({
          error: (err as Error).message || 'Error al cargar mostrador offline',
          isLoading: false,
        });
        return;
      }
    }

    try {
      const [productsRes] = await Promise.all([
        catalogApi.fetchProducts({
          page: 1,
          limit: 50,
          status: 'ACTIVE',
          onlyAvailable: true,
        }),
        quickPromise,
      ]);

      if (
        !isRequestValid(generation, tenantId, locationId, requestId, latestPosRequestId) ||
        productsWriterId !== latestProductsWriterId
      ) {
        return;
      }

      const items = productsRes.items.map(mapResponseToItem);

      // Trigger full sync of all vendible products in background
      get()
        .syncAllAvailableProductsToOffline(tenantId, locationId)
        .catch(() => {});

      set({
        products: items,
        isLoading: false,
      });
    } catch (err: unknown) {
      if (
        !isRequestValid(generation, tenantId, locationId, requestId, latestPosRequestId) ||
        productsWriterId !== latestProductsWriterId
      ) {
        return;
      }

      try {
        const cached = await offlineDb.getCachedProducts(tenantId, locationId, {
          onlyActive: true,
          onlyAvailable: true,
        });
        if (
          !isRequestValid(generation, tenantId, locationId, requestId, latestPosRequestId) ||
          productsWriterId !== latestProductsWriterId
        ) {
          return;
        }
        if (cached.length > 0) {
          const items = cached.map(mapCachedToItem);
          set({
            products: items,
            isLoading: false,
            isOffline: true,
          });
          return;
        }
      } catch {
        // Fallback failed
      }

      if (
        !isRequestValid(generation, tenantId, locationId, requestId, latestPosRequestId) ||
        productsWriterId !== latestProductsWriterId
      ) {
        return;
      }

      set({
        error: (err as Error).message || 'Error al sincronizar mostrador',
        isLoading: false,
      });
    }
  },

  loadQuickProducts: async (tenantId: string, locationId: string, isOffline = false) => {
    if (
      activeTenantId === null ||
      activeLocationId === null ||
      activeTenantId !== tenantId ||
      activeLocationId !== locationId
    ) {
      return;
    }
    const generation = currentSessionGeneration;
    const requestId = ++latestQuickRequestId;

    if (isOffline) {
      try {
        const cached = await offlineDb.getCachedQuickProducts(tenantId, locationId);
        if (!isRequestValid(generation, tenantId, locationId, requestId, latestQuickRequestId)) {
          return;
        }
        const items = cached.map(mapCachedToItem);
        set({ quickProducts: items });
      } catch {
        // Ignored
      }
      return;
    }

    try {
      const prods = await catalogApi.fetchQuickProducts();
      if (!isRequestValid(generation, tenantId, locationId, requestId, latestQuickRequestId)) {
        return;
      }
      const items = prods.map(mapResponseToItem);
      set({ quickProducts: items });
    } catch {
      try {
        const cached = await offlineDb.getCachedQuickProducts(tenantId, locationId);
        if (!isRequestValid(generation, tenantId, locationId, requestId, latestQuickRequestId)) {
          return;
        }
        const items = cached.map(mapCachedToItem);
        set({ quickProducts: items });
      } catch {
        // Ignored
      }
    }
  },

  syncAllAvailableProductsToOffline: async (tenantId: string, locationId: string) => {
    if (
      activeTenantId === null ||
      activeLocationId === null ||
      activeTenantId !== tenantId ||
      activeLocationId !== locationId
    ) {
      return;
    }
    const generation = currentSessionGeneration;
    const dbGen = offlineDb.getGeneration();
    const syncId = ++latestSyncRequestId;

    try {
      let currentPage = 1;
      const pageSize = 100;
      let totalPages = 1;
      const allVendible: ProductResponse[] = [];

      while (currentPage <= totalPages) {
        if (!isRequestValid(generation, tenantId, locationId, syncId, latestSyncRequestId)) {
          return;
        }
        const res = await catalogApi.fetchProducts({
          page: currentPage,
          limit: pageSize,
          onlyAvailable: true,
          status: 'ACTIVE',
        });
        if (!isRequestValid(generation, tenantId, locationId, syncId, latestSyncRequestId)) {
          return;
        }
        totalPages = res.totalPages;
        allVendible.push(...res.items);
        if (currentPage >= totalPages || res.items.length === 0) break;
        currentPage++;
      }

      if (!isRequestValid(generation, tenantId, locationId, syncId, latestSyncRequestId)) {
        return;
      }

      // Replaces cache for this location (even when 0 vendible)
      await offlineDb.cacheProducts(tenantId, locationId, allVendible, { generation: dbGen });
    } catch {
      // Network failure does NOT erase cache
    }
  },

  searchPosProducts: async (
    tenantId: string,
    locationId: string,
    query: string,
    isOffline = false
  ): Promise<CatalogProductItem[]> => {
    const trimmed = query.trim();
    if (!trimmed) {
      return [];
    }

    const generation = currentSessionGeneration;

    if (isOffline) {
      const cached = await offlineDb.searchCachedProducts(tenantId, locationId, trimmed);
      if (
        generation !== currentSessionGeneration ||
        (activeTenantId !== null && tenantId !== activeTenantId) ||
        (activeLocationId !== null && locationId !== activeLocationId)
      ) {
        return [];
      }
      return cached.map(mapCachedToItem);
    }

    try {
      const res = await catalogApi.fetchProducts({
        q: trimmed,
        onlyAvailable: true,
        status: 'ACTIVE',
        limit: 50,
      });
      if (
        generation !== currentSessionGeneration ||
        (activeTenantId !== null && tenantId !== activeTenantId) ||
        (activeLocationId !== null && locationId !== activeLocationId)
      ) {
        return [];
      }
      return res.items.map(mapResponseToItem);
    } catch {
      const cached = await offlineDb.searchCachedProducts(tenantId, locationId, trimmed);
      if (
        generation !== currentSessionGeneration ||
        (activeTenantId !== null && tenantId !== activeTenantId) ||
        (activeLocationId !== null && locationId !== activeLocationId)
      ) {
        return [];
      }
      return cached.map(mapCachedToItem);
    }
  },

  searchProducts: async (
    tenantId: string,
    locationId: string,
    query: string,
    isOffline = false
  ) => {
    set({ searchQuery: query });
    await get().loadCatalog(tenantId, locationId, { q: query, isOffline });
  },

  setSearchQuery: (q: string) => set({ searchQuery: q }),

  setSelectedCategory: (catId: string | null) => set({ selectedCategory: catId }),

  setStatusFilter: (status: 'ALL' | 'ACTIVE' | 'INACTIVE') => set({ statusFilter: status }),

  setPage: (page: number) => set({ page }),

  loadCategories: async (tenantId?: string, locationId?: string) => {
    const generation = currentSessionGeneration;
    const reqTenantId = tenantId ?? activeTenantId;
    const reqLocationId = locationId ?? activeLocationId;
    const requestId = ++latestCategoriesRequestId;

    try {
      const categories = await catalogApi.fetchCategories();
      if (
        generation !== currentSessionGeneration ||
        activeTenantId === null ||
        (reqTenantId !== null && activeTenantId !== reqTenantId) ||
        (reqLocationId !== null && activeLocationId !== reqLocationId) ||
        requestId !== latestCategoriesRequestId
      ) {
        return;
      }
      set({ categories });
    } catch {
      // Ignore in offline mode
    }
  },

  createCategory: async (dto: CreateCategoryCommand, tenantId?: string, locationId?: string) => {
    const generation = currentSessionGeneration;
    const reqTenantId = tenantId ?? activeTenantId;
    const reqLocationId = locationId ?? activeLocationId;

    const created = await catalogApi.createCategory(dto);
    if (
      generation !== currentSessionGeneration ||
      activeTenantId === null ||
      (reqTenantId !== null && activeTenantId !== reqTenantId) ||
      (reqLocationId !== null && activeLocationId !== reqLocationId)
    ) {
      return created;
    }
    set((state) => ({ categories: [...state.categories, created] }));
    return created;
  },

  createProduct: async (tenantId: string, locationId: string, dto: CreateProductCommand) => {
    const generation = currentSessionGeneration;
    try {
      const created = await catalogApi.createProduct(dto);
      if (!isMutationValid(generation, tenantId, locationId)) {
        return created;
      }
      await get().loadCatalog(tenantId, locationId);
      if (!isMutationValid(generation, tenantId, locationId)) {
        return created;
      }
      await get().loadQuickProducts(tenantId, locationId);
      return created;
    } catch (err) {
      if (!isMutationValid(generation, tenantId, locationId)) {
        throw err;
      }
      throw err;
    }
  },

  updateProduct: async (
    tenantId: string,
    locationId: string,
    id: string,
    dto: UpdateProductCommand
  ) => {
    const generation = currentSessionGeneration;
    try {
      const updated = await catalogApi.updateProduct(id, dto);
      if (!isMutationValid(generation, tenantId, locationId)) {
        return updated;
      }
      await get().loadCatalog(tenantId, locationId);
      if (!isMutationValid(generation, tenantId, locationId)) {
        return updated;
      }
      await get().loadQuickProducts(tenantId, locationId);
      return updated;
    } catch (err) {
      if (!isMutationValid(generation, tenantId, locationId)) {
        throw err;
      }
      throw err;
    }
  },

  updateLocationSettings: async (
    tenantId: string,
    locationId: string,
    id: string,
    dto: UpdateLocationSettingsCommand
  ) => {
    const generation = currentSessionGeneration;
    try {
      await catalogApi.updateLocationSettings(id, dto);
      if (!isMutationValid(generation, tenantId, locationId)) {
        return;
      }
      await get().loadCatalog(tenantId, locationId);
      if (!isMutationValid(generation, tenantId, locationId)) {
        return;
      }
      await get().loadQuickProducts(tenantId, locationId);
    } catch (err) {
      if (!isMutationValid(generation, tenantId, locationId)) {
        throw err;
      }
      throw err;
    }
  },

  adjustStock: async (
    tenantId: string,
    locationId: string,
    id: string,
    dto: CreateStockAdjustmentCommand
  ) => {
    const generation = currentSessionGeneration;
    try {
      await catalogApi.adjustStock(id, dto);
      if (!isMutationValid(generation, tenantId, locationId)) {
        return;
      }
      await get().loadCatalog(tenantId, locationId);
      if (!isMutationValid(generation, tenantId, locationId)) {
        return;
      }
      await get().loadQuickProducts(tenantId, locationId);
    } catch (err) {
      if (!isMutationValid(generation, tenantId, locationId)) {
        throw err;
      }
      throw err;
    }
  },

  clearCatalog: () => {
    currentSessionGeneration++;
    latestAdminRequestId++;
    latestPosRequestId++;
    latestQuickRequestId++;
    latestSyncRequestId++;
    latestProductsWriterId++;
    latestCategoriesRequestId++;
    activeTenantId = null;
    activeLocationId = null;
    offlineDb.bumpGeneration();
    set({
      products: [],
      quickProducts: [],
      categories: [],
      total: 0,
      page: 1,
      totalPages: 1,
      searchQuery: '',
      selectedCategory: null,
      statusFilter: 'ALL',
      isLoading: false,
      error: null,
      isOffline: false,
    });
  },
}));
