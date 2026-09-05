import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCatalogStore } from '../src/features/catalog/store/catalog.store';
import { offlineDb } from '../src/features/sync/offline-db';
import { catalogApi } from '../src/features/catalog/services/catalog-api';
import { ProductResponse, CategoryResponse, PaginatedProductsResponse } from '@pulso/contracts';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeProduct(
  id: string,
  name: string,
  overrides: Partial<ProductResponse> = {}
): ProductResponse {
  return {
    id,
    tenantId: 'tenant-1',
    categoryId: null,
    name,
    normalizedName: name.toLowerCase(),
    barcode: `barcode-${id}`,
    sku: null,
    salePriceCents: 1000,
    costPriceCents: null,
    unit: 'UNIT',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    locationSettings: {
      productId: id,
      locationId: 'loc-1',
      stockQuantity: '10.0000',
      minimumStock: '2.0000',
      isAvailable: true,
      quickSlot: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

describe('Catalog Concurrency, Session Invalidation & Epoch Sequencing', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    useCatalogStore.getState().clearCatalog();
    await offlineDb.clearAllCachedProducts();
    await offlineDb.clearAll();
  });

  describe('BLOQUEANTE 1: Invalidación de Sesión y Logout', () => {
    it('in-flight syncAllAvailableProductsToOffline resolving after logout does not repopulate store or IndexedDB and preserves syncQueue', async () => {
      // 1. Enqueue a pending sale in syncQueue to prove it is preserved
      await offlineDb.enqueueSale({
        shiftId: 'shift-1',
        idempotencyKey: 'pending-sale-preserved-1',
        items: [
          {
            productId: 'p1',
            name: 'Item',
            quantity: 1,
            unitPriceCents: 1000,
            totalPriceCents: 1000,
          },
        ],
        tenders: [
          { type: 'CASH', amountCents: 1000, receivedAmountCents: 1000, changeAmountCents: 0 },
        ],
        totalCents: 1000,
        createdAtUtc: new Date().toISOString(),
      });

      // 2. Controlled deferred fetch for sync
      const deferredSync = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      vi.spyOn(catalogApi, 'fetchProducts').mockReturnValue(deferredSync.promise);

      // A. Start sync
      const syncPromise = useCatalogStore
        .getState()
        .syncAllAvailableProductsToOffline('tenant-1', 'loc-1');

      // B. Trigger logout immediately while fetch is in-flight
      useCatalogStore.getState().clearCatalog();
      await offlineDb.clearCachedCatalog();

      // C. Now resolve the stale fetch with products
      const staleProduct = makeProduct('prod-stale', 'Producto Obsoleto');
      deferredSync.resolve({
        items: [staleProduct],
        total: 1,
        page: 1,
        limit: 100,
        totalPages: 1,
      });

      // D. Await sync finish
      await syncPromise;

      // E. Verify store is EMPTY
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(0);
      expect(state.quickProducts).toHaveLength(0);
      expect(state.categories).toHaveLength(0);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();

      // F. Verify IndexedDB cachedProducts is EMPTY
      const cached = await offlineDb.getCachedProducts('tenant-1', 'loc-1', {
        onlyActive: false,
        onlyAvailable: false,
      });
      expect(cached).toHaveLength(0);

      // G. Verify syncQueue preserved exactly
      const pending = await offlineDb.getAllPending();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.payload.idempotencyKey).toBe('pending-sale-preserved-1');
    });

    it('transition test: loadCatalog for Tenant A is superseded by Tenant B; resolving A last does not corrupt Tenant B data', async () => {
      const deferredA = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      const deferredB = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.q === 'query-A') return deferredA.promise;
        if (params.q === 'query-B') return deferredB.promise;
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      // 1. Start load for Tenant A
      const promiseA = useCatalogStore
        .getState()
        .loadCatalog('tenant-A', 'loc-A', { q: 'query-A' });

      // 2. Switch session / tenant to Tenant B
      useCatalogStore.getState().clearCatalog();
      const promiseB = useCatalogStore
        .getState()
        .loadCatalog('tenant-B', 'loc-B', { q: 'query-B' });

      // 3. Resolve B first
      const productB = makeProduct('prod-B', 'Producto Tenant B', { tenantId: 'tenant-B' });
      deferredB.resolve({
        items: [productB],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseB;

      expect(useCatalogStore.getState().products).toHaveLength(1);
      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto Tenant B');

      // 4. Resolve A after B
      const productA = makeProduct('prod-A', 'Producto Tenant A', { tenantId: 'tenant-A' });
      deferredA.resolve({
        items: [productA],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseA;

      // 5. Store must strictly contain Tenant B data only
      const finalState = useCatalogStore.getState();
      expect(finalState.products).toHaveLength(1);
      expect(finalState.products[0]?.name).toBe('Producto Tenant B');
      expect(finalState.products.find((p) => p.name === 'Producto Tenant A')).toBeUndefined();
    });
  });

  describe('BLOQUEANTE 2: Respuestas Administrativas Fuera de Orden en loadCatalog', () => {
    it('resolving query "gaseosa" (B) before query "agua" (A) keeps "gaseosa" and discards "agua"', async () => {
      const deferredAgua = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      const deferredGaseosa = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.q === 'agua') return deferredAgua.promise;
        if (params.q === 'gaseosa') return deferredGaseosa.promise;
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      // 1. Initiate request A ("agua")
      const promiseA = useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1', { q: 'agua' });

      // 2. Initiate request B ("gaseosa")
      const promiseB = useCatalogStore
        .getState()
        .loadCatalog('tenant-1', 'loc-1', { q: 'gaseosa' });

      // 3. Resolve B first
      deferredGaseosa.resolve({
        items: [makeProduct('prod-gaseosa', 'Gaseosa Cola')],
        total: 10,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseB;

      // Assert gaseosa is in state
      expect(useCatalogStore.getState().products).toHaveLength(1);
      expect(useCatalogStore.getState().products[0]?.name).toBe('Gaseosa Cola');
      expect(useCatalogStore.getState().total).toBe(10);

      // 4. Resolve A after B
      deferredAgua.resolve({
        items: [makeProduct('prod-agua', 'Agua Mineral')],
        total: 50,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseA;

      // 5. Assert state STILL corresponds to B ("gaseosa")
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(1);
      expect(state.products[0]?.name).toBe('Gaseosa Cola');
      expect(state.total).toBe(10);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('rapid page change: resolving page 2 (B) before page 1 (A) keeps page 2 data and metadata', async () => {
      const deferredP1 = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      const deferredP2 = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.page === 1) return deferredP1.promise;
        if (params.page === 2) return deferredP2.promise;
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      const promiseP1 = useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1', { page: 1 });
      const promiseP2 = useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1', { page: 2 });

      deferredP2.resolve({
        items: [makeProduct('prod-p2', 'Producto Página 2')],
        total: 100,
        page: 2,
        limit: 50,
        totalPages: 2,
      });
      await promiseP2;

      expect(useCatalogStore.getState().page).toBe(2);
      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto Página 2');

      deferredP1.resolve({
        items: [makeProduct('prod-p1', 'Producto Página 1')],
        total: 100,
        page: 1,
        limit: 50,
        totalPages: 2,
      });
      await promiseP1;

      expect(useCatalogStore.getState().page).toBe(2);
      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto Página 2');
    });

    it('rapid statusFilter change: resolving INACTIVE (B) before ACTIVE (A) keeps INACTIVE data', async () => {
      const deferredActive = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      const deferredInactive = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.status === 'ACTIVE') return deferredActive.promise;
        if (params.status === 'INACTIVE') return deferredInactive.promise;
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      const promiseA = useCatalogStore
        .getState()
        .loadCatalog('tenant-1', 'loc-1', { status: 'ACTIVE' });
      const promiseB = useCatalogStore
        .getState()
        .loadCatalog('tenant-1', 'loc-1', { status: 'INACTIVE' });

      deferredInactive.resolve({
        items: [makeProduct('prod-inact', 'Producto Inactivo', { isActive: false })],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseB;

      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto Inactivo');

      deferredActive.resolve({
        items: [makeProduct('prod-act', 'Producto Activo', { isActive: true })],
        total: 99,
        page: 1,
        limit: 50,
        totalPages: 2,
      });
      await promiseA;

      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto Inactivo');
      expect(useCatalogStore.getState().total).toBe(1);
    });

    it('rapid categoryId change: resolving Category B before Category A keeps Category B data', async () => {
      const deferredCatA = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      const deferredCatB = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.categoryId === 'cat-A') return deferredCatA.promise;
        if (params.categoryId === 'cat-B') return deferredCatB.promise;
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      const promiseA = useCatalogStore
        .getState()
        .loadCatalog('tenant-1', 'loc-1', { categoryId: 'cat-A' });
      const promiseB = useCatalogStore
        .getState()
        .loadCatalog('tenant-1', 'loc-1', { categoryId: 'cat-B' });

      deferredCatB.resolve({
        items: [makeProduct('prod-cat-B', 'Producto Bebida', { categoryId: 'cat-B' })],
        total: 12,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseB;

      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto Bebida');

      deferredCatA.resolve({
        items: [makeProduct('prod-cat-A', 'Producto Golosina', { categoryId: 'cat-A' })],
        total: 40,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseA;

      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto Bebida');
      expect(useCatalogStore.getState().total).toBe(12);
    });

    it('stale request A failing after new request B succeeded is ignored and does NOT set error nor trigger stale fallback', async () => {
      const deferredFailA = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      const deferredSuccessB = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.q === 'failing-query') return deferredFailA.promise;
        if (params.q === 'success-query') return deferredSuccessB.promise;
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 50, totalPages: 1 });
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      const promiseA = useCatalogStore
        .getState()
        .loadCatalog('tenant-1', 'loc-1', { q: 'failing-query' });
      const promiseB = useCatalogStore
        .getState()
        .loadCatalog('tenant-1', 'loc-1', { q: 'success-query' });

      // Resolve B with success
      deferredSuccessB.resolve({
        items: [makeProduct('prod-success', 'Producto Exitoso')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseB;

      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto Exitoso');
      expect(useCatalogStore.getState().error).toBeNull();
      expect(useCatalogStore.getState().isLoading).toBe(false);

      // Now reject A with network error
      deferredFailA.reject(new Error('Network error from stale query'));
      await promiseA;

      // Verify state was NOT overwritten with error or fallback
      const state = useCatalogStore.getState();
      expect(state.products[0]?.name).toBe('Producto Exitoso');
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('COBERTURA ADICIONAL: Quick Products & Sincronización Paginada Atómica', () => {
    it('loadQuickProducts: stale response does not overwrite newer quick products', async () => {
      vi.spyOn(catalogApi, 'fetchProducts').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      await useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1');

      const deferredQ1 = createDeferred<ProductResponse[]>();
      const deferredQ2 = createDeferred<ProductResponse[]>();

      let callCount = 0;
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockImplementation(() => {
        callCount++;
        if (callCount === 1) return deferredQ1.promise;
        return deferredQ2.promise;
      });

      const promise1 = useCatalogStore.getState().loadQuickProducts('tenant-1', 'loc-1');
      const promise2 = useCatalogStore.getState().loadQuickProducts('tenant-1', 'loc-1');

      // Resolve call 2 first
      deferredQ2.resolve([
        makeProduct('prod-q2', 'Quick Slot New', {
          locationSettings: {
            productId: 'prod-q2',
            locationId: 'loc-1',
            stockQuantity: '5',
            minimumStock: '1',
            isAvailable: true,
            quickSlot: 1,
            version: 1,
            createdAt: '',
            updatedAt: '',
          },
        }),
      ]);
      await promise2;

      expect(useCatalogStore.getState().quickProducts[0]?.name).toBe('Quick Slot New');

      // Resolve call 1 later
      deferredQ1.resolve([
        makeProduct('prod-q1', 'Quick Slot Stale', {
          locationSettings: {
            productId: 'prod-q1',
            locationId: 'loc-1',
            stockQuantity: '5',
            minimumStock: '1',
            isAvailable: true,
            quickSlot: 1,
            version: 1,
            createdAt: '',
            updatedAt: '',
          },
        }),
      ]);
      await promise1;

      expect(useCatalogStore.getState().quickProducts[0]?.name).toBe('Quick Slot New');
    });

    it('loadQuickProducts: in-flight call resolving after logout does not repopulate quickProducts', async () => {
      vi.spyOn(catalogApi, 'fetchProducts').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      await useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1');

      const deferredQ = createDeferred<ProductResponse[]>();
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockReturnValue(deferredQ.promise);

      const promise = useCatalogStore.getState().loadQuickProducts('tenant-1', 'loc-1');

      // Logout called immediately
      useCatalogStore.getState().clearCatalog();
      await offlineDb.clearCachedCatalog();

      deferredQ.resolve([makeProduct('prod-q-late', 'Late Quick Product')]);
      await promise;

      expect(useCatalogStore.getState().quickProducts).toHaveLength(0);
    });

    it('atomic paginated sync: if page 1 succeeds but page 2 fails, previous IndexedDB snapshot remains intact (no partial overwrite)', async () => {
      // Seed existing snapshot
      const existingProduct = makeProduct('prod-existing', 'Producto Existente');
      await offlineDb.cacheProducts('tenant-1', 'loc-1', [existingProduct]);

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation(async (params = {}) => {
        if (params.page === 1) {
          return {
            items: [makeProduct('prod-p1', 'Nuevo P1')],
            total: 200,
            page: 1,
            limit: 100,
            totalPages: 2,
          };
        }
        // Page 2 fails!
        throw new Error('Failed to fetch page 2');
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      // Iniciar sesión activa para el tenant/sucursal
      await useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1');

      await useCatalogStore.getState().syncAllAvailableProductsToOffline('tenant-1', 'loc-1');

      // Assert existing product is STILL in IndexedDB, and partial page 1 was NOT written!
      const cached = await offlineDb.getCachedProducts('tenant-1', 'loc-1', {
        onlyActive: false,
        onlyAvailable: false,
      });
      expect(cached).toHaveLength(1);
      expect(cached[0]?.name).toBe('Producto Existente');
      expect(cached.find((p) => p.name === 'Nuevo P1')).toBeUndefined();
    });

    it('paginated sync: successful 0-product response clears previous IndexedDB snapshot', async () => {
      // Seed existing snapshot
      const existingProduct = makeProduct('prod-existing', 'Producto Existente');
      await offlineDb.cacheProducts('tenant-1', 'loc-1', [existingProduct]);

      vi.spyOn(catalogApi, 'fetchProducts').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 100,
        totalPages: 1,
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      // Iniciar sesión activa para el tenant/sucursal
      await useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1');

      await useCatalogStore.getState().syncAllAvailableProductsToOffline('tenant-1', 'loc-1');

      const cached = await offlineDb.getCachedProducts('tenant-1', 'loc-1', {
        onlyActive: false,
        onlyAvailable: false,
      });
      expect(cached).toHaveLength(0);
    });
  });

  describe('BLOQUEANTE 1: Carrera Cruzada Entre Administración y POS', () => {
    it('caso A: Admin pendiente → POS resuelve → Admin resuelve tarde → products queda exclusivamente con productos del POS', async () => {
      const deferredAdmin = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      const deferredPos = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.onlyAvailable === true && params.status === 'ACTIVE') {
          return deferredPos.promise;
        }
        return deferredAdmin.promise;
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      // 1. Admin inicia loadCatalog
      const promiseAdmin = useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1');

      // 2. Usuario navega al Mostrador (POS) e inicia loadPosCatalog
      const promisePos = useCatalogStore.getState().loadPosCatalog('tenant-1', 'loc-1');

      // 3. POS resuelve primero con sus productos vendibles
      const posProduct = makeProduct('prod-pos-1', 'Coca Cola 500ml', {
        locationSettings: {
          productId: 'prod-pos-1',
          locationId: 'loc-1',
          stockQuantity: '10.0000',
          minimumStock: '2.0000',
          isAvailable: true,
          quickSlot: 1,
          version: 1,
          createdAt: '',
          updatedAt: '',
        },
      });
      deferredPos.resolve({
        items: [posProduct],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promisePos;

      // El store debe reflejar el POS
      expect(useCatalogStore.getState().products).toHaveLength(1);
      expect(useCatalogStore.getState().products[0]?.name).toBe('Coca Cola 500ml');

      // 4. Admin resuelve tarde con productos que incluyen no vendibles o inactivos
      const adminProduct = makeProduct('prod-admin-stale', 'Producto Administrativo Inactivo', {
        isActive: false,
      });
      deferredAdmin.resolve({
        items: [adminProduct],
        total: 10,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseAdmin;

      // 5. El store DEBE mantener exclusivamente los productos del POS y NO sobrescribir con Admin
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(1);
      expect(state.products[0]?.name).toBe('Coca Cola 500ml');
      expect(
        state.products.find((p) => p.name === 'Producto Administrativo Inactivo')
      ).toBeUndefined();
    });

    it('caso B: POS pendiente → Admin resuelve → POS resuelve tarde → products queda exclusivamente con productos del Admin', async () => {
      const deferredAdmin = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();
      const deferredPos = createDeferred<{
        items: ProductResponse[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      }>();

      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.onlyAvailable === true && params.status === 'ACTIVE') {
          return deferredPos.promise;
        }
        return deferredAdmin.promise;
      });
      vi.spyOn(catalogApi, 'fetchCategories').mockResolvedValue([]);
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      // 1. POS inicia loadPosCatalog
      const promisePos = useCatalogStore.getState().loadPosCatalog('tenant-1', 'loc-1');

      // 2. Usuario navega a Administración e inicia loadCatalog
      const promiseAdmin = useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1');

      // 3. Admin resuelve primero
      const adminProduct = makeProduct('prod-admin-1', 'Producto de Administración');
      deferredAdmin.resolve({
        items: [adminProduct],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promiseAdmin;

      expect(useCatalogStore.getState().products).toHaveLength(1);
      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto de Administración');

      // 4. POS resuelve tarde
      const stalePosProduct = makeProduct('prod-pos-stale', 'Producto POS Desfasado');
      deferredPos.resolve({
        items: [stalePosProduct],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await promisePos;

      // 5. El store DEBE mantener exclusivamente los productos del Admin
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(1);
      expect(state.products[0]?.name).toBe('Producto de Administración');
      expect(state.products.find((p) => p.name === 'Producto POS Desfasado')).toBeUndefined();
    });
  });

  describe('BLOQUEANTE 2: Operaciones y Mutaciones Auxiliares sin Generación', () => {
    it('1. loadCategories en vuelo → logout/invalidación → resuelve → categories queda vacío y no reactiva estado', async () => {
      const deferredCat = createDeferred<CategoryResponse[]>();
      vi.spyOn(catalogApi, 'fetchCategories').mockReturnValue(deferredCat.promise);

      // Simular sesión activa
      await useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1');

      // Iniciar loadCategories
      const promise = useCatalogStore.getState().loadCategories();

      // Logout mientras está en vuelo
      useCatalogStore.getState().clearCatalog();

      // Resuelve la petición de categorías desfasada
      deferredCat.resolve([
        {
          id: 'cat-stale',
          tenantId: 'tenant-1',
          name: 'Categoría Obsoleta',
          normalizedName: 'categoria obsoleta',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      await promise;

      // Categories DEBE quedar vacío
      expect(useCatalogStore.getState().categories).toHaveLength(0);
    });

    it('2. createCategory en vuelo → logout/invalidación → resuelve → categories queda vacío', async () => {
      const deferredCreate = createDeferred<CategoryResponse>();
      vi.spyOn(catalogApi, 'createCategory').mockReturnValue(deferredCreate.promise);

      // Simular sesión activa
      await useCatalogStore.getState().loadCatalog('tenant-1', 'loc-1');

      const promise = useCatalogStore.getState().createCategory({ name: 'Snacks' });

      // Logout mientras está en vuelo
      useCatalogStore.getState().clearCatalog();

      deferredCreate.resolve({
        id: 'cat-new',
        tenantId: 'tenant-1',
        name: 'Snacks',
        normalizedName: 'snacks',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await promise;

      // Categories DEBE quedar vacío
      expect(useCatalogStore.getState().categories).toHaveLength(0);
    });

    it('3. createProduct del Tenant A en vuelo → cambio al Tenant B → createProduct resuelve tarde → NO dispara loadCatalog ni loadQuickProducts del Tenant A y activeTenantId permanece en Tenant B', async () => {
      const deferredCreate = createDeferred<ProductResponse>();
      vi.spyOn(catalogApi, 'createProduct').mockReturnValue(deferredCreate.promise);

      const spyLoadCatalog = vi.spyOn(catalogApi, 'fetchProducts');
      spyLoadCatalog.mockResolvedValue({
        items: [makeProduct('prod-init', 'Inicial')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      const spyQuick = vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      // Cargar Tenant A
      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A');

      // Iniciar createProduct para Tenant A
      const createPromise = useCatalogStore.getState().createProduct('tenant-A', 'loc-A', {
        name: 'Nuevo Producto A',
        salePriceCents: 1000,
      });

      // Cambiar a Tenant B
      spyLoadCatalog.mockResolvedValue({
        items: [makeProduct('prod-B', 'Producto de Tenant B', { tenantId: 'tenant-B' })],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await useCatalogStore.getState().loadCatalog('tenant-B', 'loc-B');

      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto de Tenant B');

      // Reset spys to inspect calls during createProduct resolution
      spyLoadCatalog.mockClear();
      spyQuick.mockClear();

      // Resolver mutación del Tenant A tardíamente
      deferredCreate.resolve(
        makeProduct('prod-A-created', 'Nuevo Producto A', { tenantId: 'tenant-A' })
      );
      await createPromise;

      // NO debe haberse invocado loadCatalog ni loadQuickProducts para Tenant A
      expect(spyLoadCatalog).not.toHaveBeenCalled();
      expect(spyQuick).not.toHaveBeenCalled();

      // Store DEBE permanecer en Tenant B con sus productos intactos
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(1);
      expect(state.products[0]?.name).toBe('Producto de Tenant B');
      expect(state.products.find((p) => p.name === 'Nuevo Producto A')).toBeUndefined();
    });

    it('4a. updateProduct del Tenant A en vuelo → cambio al Tenant B → updateProduct resuelve tarde → NO recarga Tenant A', async () => {
      const deferredUpdate = createDeferred<ProductResponse>();
      vi.spyOn(catalogApi, 'updateProduct').mockReturnValue(deferredUpdate.promise);

      const spyLoadCatalog = vi.spyOn(catalogApi, 'fetchProducts');
      spyLoadCatalog.mockResolvedValue({
        items: [makeProduct('prod-init', 'Inicial')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A');

      const updatePromise = useCatalogStore
        .getState()
        .updateProduct('tenant-A', 'loc-A', 'prod-A', {
          name: 'Producto A Editado',
        });

      // Cambiar a Tenant B
      spyLoadCatalog.mockResolvedValue({
        items: [makeProduct('prod-B', 'Producto de Tenant B', { tenantId: 'tenant-B' })],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await useCatalogStore.getState().loadCatalog('tenant-B', 'loc-B');

      spyLoadCatalog.mockClear();

      deferredUpdate.resolve(makeProduct('prod-A', 'Producto A Editado', { tenantId: 'tenant-A' }));
      await updatePromise;

      expect(spyLoadCatalog).not.toHaveBeenCalled();
      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto de Tenant B');
    });

    it('4b. updateLocationSettings del Tenant A en vuelo → cambio al Tenant B → updateLocationSettings resuelve tarde → NO recarga Tenant A', async () => {
      const deferredSettings =
        createDeferred<Awaited<ReturnType<typeof catalogApi.updateLocationSettings>>>();
      vi.spyOn(catalogApi, 'updateLocationSettings').mockReturnValue(deferredSettings.promise);

      const spyLoadCatalog = vi.spyOn(catalogApi, 'fetchProducts');
      spyLoadCatalog.mockResolvedValue({
        items: [makeProduct('prod-init', 'Inicial')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A');

      const settingsPromise = useCatalogStore
        .getState()
        .updateLocationSettings('tenant-A', 'loc-A', 'prod-A', {
          quickSlot: 2,
        });

      // Cambiar a Tenant B
      spyLoadCatalog.mockResolvedValue({
        items: [makeProduct('prod-B', 'Producto de Tenant B', { tenantId: 'tenant-B' })],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await useCatalogStore.getState().loadCatalog('tenant-B', 'loc-B');

      spyLoadCatalog.mockClear();

      deferredSettings.resolve({
        productId: 'prod-A',
        locationId: 'loc-A',
        stockQuantity: '10.0000',
        minimumStock: '2.0000',
        isAvailable: true,
        quickSlot: 2,
        version: 1,
      });
      await settingsPromise;

      expect(spyLoadCatalog).not.toHaveBeenCalled();
      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto de Tenant B');
    });

    it('4c. adjustStock del Tenant A en vuelo → cambio al Tenant B → adjustStock resuelve tarde → NO recarga Tenant A', async () => {
      const deferredAdjust = createDeferred<Awaited<ReturnType<typeof catalogApi.adjustStock>>>();
      vi.spyOn(catalogApi, 'adjustStock').mockReturnValue(deferredAdjust.promise);

      const spyLoadCatalog = vi.spyOn(catalogApi, 'fetchProducts');
      spyLoadCatalog.mockResolvedValue({
        items: [makeProduct('prod-init', 'Inicial')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A');

      const adjustPromise = useCatalogStore.getState().adjustStock('tenant-A', 'loc-A', 'prod-A', {
        type: 'ADJUSTMENT_IN',
        quantity: '5',
        reason: 'Ajuste manual de prueba',
        expectedVersion: 1,
      });

      // Cambiar a Tenant B
      spyLoadCatalog.mockResolvedValue({
        items: [makeProduct('prod-B', 'Producto de Tenant B', { tenantId: 'tenant-B' })],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      await useCatalogStore.getState().loadCatalog('tenant-B', 'loc-B');

      spyLoadCatalog.mockClear();

      deferredAdjust.resolve({
        movement: {
          id: 'mov-1',
          tenantId: 'tenant-A',
          locationId: 'loc-A',
          productId: 'prod-A',
          type: 'ADJUSTMENT_IN',
          delta: '5.0000',
          previousStock: '10.0000',
          resultingStock: '15.0000',
          reason: 'Ajuste manual de prueba',
          userId: 'user-1',
          createdAt: new Date().toISOString(),
        },
        productLocation: {
          stockQuantity: '15.0000',
          version: 2,
        },
      });
      await adjustPromise;

      expect(spyLoadCatalog).not.toHaveBeenCalled();
      expect(useCatalogStore.getState().products[0]?.name).toBe('Producto de Tenant B');
    });

    it('5. mutación obsoleta fallando en red tras logout/cambio de tenant no escribe error en el store activo ni deja isLoading = true', async () => {
      const deferredCreate = createDeferred<ProductResponse>();
      vi.spyOn(catalogApi, 'createProduct').mockReturnValue(deferredCreate.promise);
      vi.spyOn(catalogApi, 'fetchProducts').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 1,
      });
      vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A');

      const createPromise = useCatalogStore.getState().createProduct('tenant-A', 'loc-A', {
        name: 'Producto Fallido',
        salePriceCents: 500,
      });

      // Logout antes de que responda
      useCatalogStore.getState().clearCatalog();

      // Rechazar con error de red
      deferredCreate.reject(new Error('Network error from stale mutation'));
      await createPromise.catch(() => {});

      // El store activo (después de logout) NO debe tener error ni isLoading = true
      const state = useCatalogStore.getState();
      expect(state.error).toBeNull();
      expect(state.isLoading).toBe(false);
    });
  });

  describe('BLOQUEANTE 3: Carrera en Refresh Encadenados tras Mutación (loadCatalog en vuelo → Logout → loadQuickProducts)', () => {
    it('createProduct: resolver createProduct → mantener pendiente loadCatalog → logout → resolver loadCatalog → loadQuickProducts NO se ejecuta y store permanece vacío', async () => {
      const deferredCreate = createDeferred<ProductResponse>();
      vi.spyOn(catalogApi, 'createProduct').mockReturnValue(deferredCreate.promise);

      const deferredRefreshCatalog = createDeferred<PaginatedProductsResponse>();
      const spyLoadCatalog = vi.spyOn(catalogApi, 'fetchProducts');
      spyLoadCatalog.mockImplementation((params = {}) => {
        if (params.q === undefined && params.status === 'ALL') {
          return deferredRefreshCatalog.promise;
        }
        return Promise.resolve({
          items: [makeProduct('prod-init', 'Inicial')],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        });
      });

      const spyQuick = vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      // 1. Cargar catálogo inicial de Tenant A
      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A', { q: 'initial' });
      spyQuick.mockClear();

      // 2. Iniciar createProduct
      const createPromise = useCatalogStore.getState().createProduct('tenant-A', 'loc-A', {
        name: 'Nuevo Producto A',
        salePriceCents: 1000,
      });

      // 3. Resolver createProduct mientras sesión es válida
      deferredCreate.resolve(
        makeProduct('prod-A-created', 'Nuevo Producto A', { tenantId: 'tenant-A' })
      );

      // 4. Esperar microtareas para que createProduct avance y ejecute await loadCatalog(...)
      await Promise.resolve();
      await Promise.resolve();

      // 5. En este momento loadCatalog está en vuelo (pendiente en deferredRefreshCatalog)
      // Ocurre clearCatalog / logout
      useCatalogStore.getState().clearCatalog();
      spyQuick.mockClear();

      // 6. Ahora resuelve tardíamente el refresh de loadCatalog
      deferredRefreshCatalog.resolve({
        items: [makeProduct('prod-stale', 'Producto Desfasado')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });

      // 7. Esperar finalización de la mutación
      await createPromise;

      // 8. Verificar que loadQuickProducts NO se ejecutó
      expect(spyQuick).not.toHaveBeenCalled();

      // 9. Verificar que el store permanece completamente vacío
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(0);
      expect(state.quickProducts).toHaveLength(0);
      expect(state.categories).toHaveLength(0);
    });

    it('updateProduct: resolver updateProduct → mantener pendiente loadCatalog → logout → resolver loadCatalog → loadQuickProducts NO se ejecuta y store permanece vacío', async () => {
      const deferredUpdate = createDeferred<ProductResponse>();
      vi.spyOn(catalogApi, 'updateProduct').mockReturnValue(deferredUpdate.promise);

      const deferredRefreshCatalog = createDeferred<PaginatedProductsResponse>();
      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.q === undefined && params.status === 'ALL') {
          return deferredRefreshCatalog.promise;
        }
        return Promise.resolve({
          items: [makeProduct('prod-init', 'Inicial')],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        });
      });

      const spyQuick = vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A', { q: 'initial' });
      spyQuick.mockClear();

      const updatePromise = useCatalogStore
        .getState()
        .updateProduct('tenant-A', 'loc-A', 'prod-A', {
          name: 'Producto A Editado',
        });

      deferredUpdate.resolve(makeProduct('prod-A', 'Producto A Editado', { tenantId: 'tenant-A' }));
      await Promise.resolve();
      await Promise.resolve();

      useCatalogStore.getState().clearCatalog();
      spyQuick.mockClear();

      deferredRefreshCatalog.resolve({
        items: [makeProduct('prod-stale', 'Producto Desfasado')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });

      await updatePromise;

      expect(spyQuick).not.toHaveBeenCalled();
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(0);
      expect(state.quickProducts).toHaveLength(0);
      expect(state.categories).toHaveLength(0);
    });

    it('updateLocationSettings: resolver updateLocationSettings → mantener pendiente loadCatalog → logout → resolver loadCatalog → loadQuickProducts NO se ejecuta y store permanece vacío', async () => {
      const deferredSettings =
        createDeferred<Awaited<ReturnType<typeof catalogApi.updateLocationSettings>>>();
      vi.spyOn(catalogApi, 'updateLocationSettings').mockReturnValue(deferredSettings.promise);

      const deferredRefreshCatalog = createDeferred<PaginatedProductsResponse>();
      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.q === undefined && params.status === 'ALL') {
          return deferredRefreshCatalog.promise;
        }
        return Promise.resolve({
          items: [makeProduct('prod-init', 'Inicial')],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        });
      });

      const spyQuick = vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A', { q: 'initial' });
      spyQuick.mockClear();

      const settingsPromise = useCatalogStore
        .getState()
        .updateLocationSettings('tenant-A', 'loc-A', 'prod-A', {
          quickSlot: 2,
        });

      deferredSettings.resolve({
        productId: 'prod-A',
        locationId: 'loc-A',
        stockQuantity: '10.0000',
        minimumStock: '2.0000',
        isAvailable: true,
        quickSlot: 2,
        version: 1,
      });
      await Promise.resolve();
      await Promise.resolve();

      useCatalogStore.getState().clearCatalog();
      spyQuick.mockClear();

      deferredRefreshCatalog.resolve({
        items: [makeProduct('prod-stale', 'Producto Desfasado')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });

      await settingsPromise;

      expect(spyQuick).not.toHaveBeenCalled();
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(0);
      expect(state.quickProducts).toHaveLength(0);
      expect(state.categories).toHaveLength(0);
    });

    it('adjustStock: resolver adjustStock → mantener pendiente loadCatalog → logout → resolver loadCatalog → loadQuickProducts NO se ejecuta y store permanece vacío', async () => {
      const deferredAdjust = createDeferred<Awaited<ReturnType<typeof catalogApi.adjustStock>>>();
      vi.spyOn(catalogApi, 'adjustStock').mockReturnValue(deferredAdjust.promise);

      const deferredRefreshCatalog = createDeferred<PaginatedProductsResponse>();
      vi.spyOn(catalogApi, 'fetchProducts').mockImplementation((params = {}) => {
        if (params.q === undefined && params.status === 'ALL') {
          return deferredRefreshCatalog.promise;
        }
        return Promise.resolve({
          items: [makeProduct('prod-init', 'Inicial')],
          total: 1,
          page: 1,
          limit: 50,
          totalPages: 1,
        });
      });

      const spyQuick = vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);

      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A', { q: 'initial' });
      spyQuick.mockClear();

      const adjustPromise = useCatalogStore.getState().adjustStock('tenant-A', 'loc-A', 'prod-A', {
        type: 'ADJUSTMENT_IN',
        quantity: '5',
        reason: 'Ajuste manual de prueba',
        expectedVersion: 1,
      });

      deferredAdjust.resolve({
        movement: {
          id: 'mov-1',
          tenantId: 'tenant-A',
          locationId: 'loc-A',
          productId: 'prod-A',
          type: 'ADJUSTMENT_IN',
          delta: '5.0000',
          previousStock: '10.0000',
          resultingStock: '15.0000',
          reason: 'Ajuste manual de prueba',
          userId: 'user-1',
          createdAt: new Date().toISOString(),
        },
        productLocation: {
          stockQuantity: '15.0000',
          version: 2,
        },
      });
      await Promise.resolve();
      await Promise.resolve();

      useCatalogStore.getState().clearCatalog();
      spyQuick.mockClear();

      deferredRefreshCatalog.resolve({
        items: [makeProduct('prod-stale', 'Producto Desfasado')],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
      });

      await adjustPromise;

      expect(spyQuick).not.toHaveBeenCalled();
      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(0);
      expect(state.quickProducts).toHaveLength(0);
      expect(state.categories).toHaveLength(0);
    });

    it('loadQuickProducts y syncAllAvailableProductsToOffline no pueden activar tenant/sucursal cuando el contexto está vacío', async () => {
      const spyQuick = vi.spyOn(catalogApi, 'fetchQuickProducts').mockResolvedValue([]);
      const spySync = vi.spyOn(catalogApi, 'fetchProducts').mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        totalPages: 1,
      });

      // Contexto vacío (logout)
      useCatalogStore.getState().clearCatalog();

      await useCatalogStore.getState().loadQuickProducts('tenant-A', 'loc-A');
      expect(spyQuick).not.toHaveBeenCalled();

      await useCatalogStore.getState().syncAllAvailableProductsToOffline('tenant-A', 'loc-A');
      expect(spySync).not.toHaveBeenCalled();

      const state = useCatalogStore.getState();
      expect(state.products).toHaveLength(0);
      expect(state.quickProducts).toHaveLength(0);
    });

    it('loadCategories y createCategory con tenantId/locationId explícitos: se descartan si hubo logout o contexto desfasado', async () => {
      const deferredCat = createDeferred<CategoryResponse[]>();
      vi.spyOn(catalogApi, 'fetchCategories').mockReturnValue(deferredCat.promise);

      const deferredCreateCat = createDeferred<CategoryResponse>();
      vi.spyOn(catalogApi, 'createCategory').mockReturnValue(deferredCreateCat.promise);

      await useCatalogStore.getState().loadCatalog('tenant-A', 'loc-A');

      const loadCatPromise = useCatalogStore.getState().loadCategories('tenant-A', 'loc-A');
      const createCatPromise = useCatalogStore
        .getState()
        .createCategory({ name: 'Golosinas' }, 'tenant-A', 'loc-A');

      useCatalogStore.getState().clearCatalog();

      deferredCat.resolve([
        {
          id: 'cat-1',
          tenantId: 'tenant-A',
          name: 'Bebidas',
          normalizedName: 'bebidas',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]);
      deferredCreateCat.resolve({
        id: 'cat-2',
        tenantId: 'tenant-A',
        name: 'Golosinas',
        normalizedName: 'golosinas',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await loadCatPromise;
      await createCatPromise;

      expect(useCatalogStore.getState().categories).toHaveLength(0);
    });
  });
});
