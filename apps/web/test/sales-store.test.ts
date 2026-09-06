import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { useSalesStore } from '../src/features/sales/store/sales.store';
import { offlineDb } from '../src/features/sync/offline-db';
import { salesApi } from '../src/features/sales/services/sales-api';
import { NetworkError, ApiError } from '../src/services/api-client';
import type {
  CreateSaleCommand,
  ProcessSaleResponse,
  PaginatedSalesResponse,
  SaleResponse,
} from '@pulso/contracts';

describe('useSalesStore - Persistence, Offline Sync & Sales History', () => {
  beforeEach(async () => {
    useSalesStore.getState().clearCart();
    useSalesStore.getState().dismissSuccess();
    useSalesStore.getState().setConnectionStatus('online');
    await offlineDb.clearAll();
    vi.restoreAllMocks();
  });

  it('processes online cash sale via salesApi and shows confirmation with real sale id', async () => {
    const mockCreatedSale = {
      id: 'sale-online-999',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      userId: 'user-1',
      idempotencyKey: 'idem-1',
      totalCents: 2000,
      status: 'COMPLETED',
      createdAtUtc: new Date().toISOString(),
      persistedAt: new Date().toISOString(),
      items: [
        {
          id: 'item-1',
          saleId: 'sale-online-999',
          productId: 'prod-1',
          name: 'Alfajor',
          quantity: '1',
          unitPriceCents: 2000,
          totalPriceCents: 2000,
        },
      ],
      tenders: [
        {
          id: 'tender-1',
          saleId: 'sale-online-999',
          type: 'CASH' as const,
          amountCents: 2000,
          receivedAmountCents: 2000,
          changeAmountCents: 0,
        },
      ],
    };

    vi.spyOn(salesApi, 'createSale').mockResolvedValueOnce({
      success: true,
      sale: mockCreatedSale,
      idempotentReplay: false,
      warnings: [],
    });

    useSalesStore.getState().addItem({
      productId: 'prod-1',
      name: 'Alfajor',
      unitPriceCents: 2000,
    });

    await useSalesStore.getState().processCashPayment(2000, 0, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    const state = useSalesStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.lastSaleSuccess).not.toBeNull();
    expect(state.lastSaleSuccess?.saleId).toBe('sale-online-999');
    expect(state.lastSaleSuccess?.isOffline).toBe(false);
    expect(state.pendingSyncCount).toBe(0);
  });

  it('falls back to offline queue with local stock deduction when network fails or offline mode active', async () => {
    // Pre-cache product in Dexie
    await offlineDb.cacheProducts('tenant-1', 'loc-1', [
      {
        id: 'prod-off-1',
        tenantId: 'tenant-1',
        categoryId: null,
        name: 'Gaseosa 500ml',
        normalizedName: 'gaseosa 500ml',
        barcode: '111222',
        sku: 'GAS-1',
        salePriceCents: 1500,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'prod-off-1',
          locationId: 'loc-1',
          stockQuantity: '15.0000',
          minimumStock: '3.0000',
          quickSlot: null,
          isAvailable: true,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ]);

    useSalesStore.getState().setConnectionStatus('offline');
    useSalesStore.getState().addItem({
      productId: 'prod-off-1',
      name: 'Gaseosa 500ml',
      unitPriceCents: 1500,
    });

    await useSalesStore.getState().processCashPayment(2000, 500, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    const state = useSalesStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.lastSaleSuccess?.isOffline).toBe(true);
    expect(state.pendingSyncCount).toBe(1);

    // Verify stock was decremented locally in Dexie
    const cached = await offlineDb.getCachedProducts('tenant-1', 'loc-1');
    expect(cached[0]?.stockQuantity).toBe('14.0000');
  });

  it('syncs pending sales to backend batch and clears sync queue', async () => {
    // Enqueue an offline sale
    await offlineDb.enqueueSale(
      {
        shiftId: 'shift-1',
        idempotencyKey: 'idem-sync-1',
        items: [
          {
            productId: 'p1',
            name: 'P1',
            quantity: 1,
            unitPriceCents: 500,
            totalPriceCents: 500,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 500 }],
        totalCents: 500,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 't1', locationId: 'l1', deviceId: 'pos-1' }
    );

    useSalesStore.setState({ pendingSyncCount: 1 });

    vi.spyOn(salesApi, 'syncBatch').mockResolvedValueOnce({
      syncedCount: 1,
      results: [
        {
          operationId: 'idem-sync-1',
          status: 'SYNCED',
          idempotentReplay: false,
          saleId: 'sale-synced-123',
          tenantId: 't1',
          locationId: 'l1',
        },
      ],
    });

    await useSalesStore.getState().syncPendingSales({ tenantId: 't1', locationId: 'l1' });

    expect(useSalesStore.getState().pendingSyncCount).toBe(0);
    expect(useSalesStore.getState().connectionStatus).toBe('online');
    const remaining = await offlineDb.getPendingCount('t1', 'l1');
    expect(remaining).toBe(0);
  });

  it('loads sales history merging server paginated sales with local pending sales', async () => {
    // Enqueue a local pending sale
    await offlineDb.enqueueSale(
      {
        shiftId: 'shift-1',
        idempotencyKey: 'local-pending-1',
        items: [
          {
            productId: 'p1',
            name: 'Producto Pendiente Local',
            quantity: 1,
            unitPriceCents: 800,
            totalPriceCents: 800,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 800 }],
        totalCents: 800,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [
        {
          id: 'server-sale-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u1',
          idempotencyKey: 'idem-srv-1',
          totalCents: 3500,
          status: 'COMPLETED',
          createdAtUtc: new Date().toISOString(),
          persistedAt: new Date().toISOString(),
          items: [],
          tenders: [{ id: 't1', saleId: 'server-sale-1', type: 'CASH', amountCents: 3500 }],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    const state = useSalesStore.getState();
    expect(state.salesHistory).toHaveLength(1);
    expect(state.salesHistory[0]?.id).toBe('server-sale-1');
    expect(state.salesHistory[0]?.status).toBe('COMPLETED');
    expect(state.salesTotal).toBe(1);

    expect(state.localSalesHistory).toHaveLength(1);
    expect(state.localSalesHistory[0]?.idempotencyKey).toBe('local-pending-1');
    expect(state.localSalesHistory[0]?.status).toBe('PENDING');
  });

  it('falls back to offline queue on real NetworkError, but rejects and never enqueues on HTTP 4xx ApiError', async () => {
    // 1. NetworkError fallback test
    vi.spyOn(salesApi, 'createSale').mockRejectedValueOnce(new NetworkError('No se pudo conectar'));

    useSalesStore.getState().addItem({
      productId: 'p-net-1',
      name: 'Alfajor',
      unitPriceCents: 1000,
    });

    await useSalesStore.getState().processCashPayment(1000, 0, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    // Enqueued offline
    expect(useSalesStore.getState().lastSaleSuccess?.isOffline).toBe(true);
    expect(await offlineDb.getPendingCount('tenant-1', 'loc-1')).toBe(1);

    // 2. ApiError (HTTP 400 Bad Request) test
    await offlineDb.clearAll();
    useSalesStore.getState().clearCart();
    useSalesStore.getState().dismissSuccess();

    vi.spyOn(salesApi, 'createSale').mockRejectedValueOnce(
      new ApiError(400, 'El producto no está disponible para venta')
    );

    useSalesStore.getState().addItem({
      productId: 'p-err-1',
      name: 'Alfajor Vencido',
      unitPriceCents: 1000,
    });

    await expect(
      useSalesStore.getState().processCashPayment(1000, 0, {
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      })
    ).rejects.toThrow('El producto no está disponible para venta');

    // Crucial: Must NEVER enqueue offline on HTTP 4xx
    expect(await offlineDb.getPendingCount('tenant-1', 'loc-1')).toBe(0);
    expect(useSalesStore.getState().lastSaleSuccess).toBeNull();
    expect(useSalesStore.getState().errorMessage).toBe('El producto no está disponible para venta');
  });

  it('omits shiftId (undefined) when no shift context is provided, never using fictitious default', async () => {
    let capturedCommand: CreateSaleCommand | null = null;
    vi.spyOn(salesApi, 'createSale').mockImplementation(async (cmd) => {
      capturedCommand = cmd;
      return {
        success: true,
        sale: {
          id: 's-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u-1',
          idempotencyKey: cmd.idempotencyKey,
          totalCents: cmd.totalCents,
          status: 'COMPLETED',
          createdAtUtc: new Date().toISOString(),
          persistedAt: new Date().toISOString(),
        },
        idempotentReplay: false,
        warnings: [],
      };
    });

    useSalesStore.getState().addItem({
      productId: 'p1',
      name: 'Item',
      unitPriceCents: 100,
    });

    await useSalesStore.getState().processCashPayment(100, 0, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    expect(capturedCommand!.shiftId).toBeUndefined();
  });

  it('handles partial batch sync, marking SYNCED and FAILED with retryCount and allowing explicit retry', async () => {
    // Enqueue two offline sales
    await offlineDb.enqueueSale(
      {
        idempotencyKey: 'idem-op-1',
        items: [
          {
            productId: 'p1',
            name: 'Item 1',
            quantity: 1,
            unitPriceCents: 100,
            totalPriceCents: 100,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100 }],
        totalCents: 100,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );
    await offlineDb.enqueueSale(
      {
        idempotencyKey: 'idem-op-2',
        items: [
          {
            productId: 'p2',
            name: 'Item 2',
            quantity: 1,
            unitPriceCents: 200,
            totalPriceCents: 200,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 200 }],
        totalCents: 200,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    useSalesStore.setState({ pendingSyncCount: 2 });

    // Mock partial sync: op-1 succeeds, op-2 fails with operational error
    vi.spyOn(salesApi, 'syncBatch').mockResolvedValueOnce({
      syncedCount: 1,
      results: [
        {
          operationId: 'idem-op-1',
          status: 'SYNCED',
          idempotentReplay: false,
          saleId: 'srv-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
        },
        {
          operationId: 'idem-op-2',
          status: 'FAILED',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          error: 'Stock insuficiente al momento de sincronizar',
        },
      ],
    });

    await useSalesStore.getState().syncPendingSales({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    // Only 0 PENDING remains (op-1 is SYNCED, op-2 is FAILED)
    expect(await offlineDb.getPendingCount('tenant-1', 'loc-1')).toBe(0);

    const pendingAndFailed = await offlineDb.getPendingSalesForLocation('tenant-1', 'loc-1');
    const failedOp = pendingAndFailed.find((op) => op.operationId === 'idem-op-2');
    expect(failedOp?.status).toBe('FAILED');
    expect(failedOp?.retryCount).toBe(1);
    expect(failedOp?.lastError).toBe('Stock insuficiente al momento de sincronizar');

    // Explicit retry of failed operation
    vi.spyOn(salesApi, 'syncBatch').mockResolvedValueOnce({
      syncedCount: 1,
      results: [
        {
          operationId: 'idem-op-2',
          status: 'SYNCED',
          idempotentReplay: false,
          saleId: 'srv-2',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
        },
      ],
    });
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    await useSalesStore
      .getState()
      .retryOfflineSale({ tenantId: 'tenant-1', locationId: 'loc-1' }, 'idem-op-2');

    const afterRetry = await offlineDb.getPendingSalesForLocation('tenant-1', 'loc-1');
    const retryRec = afterRetry.find((op) => op.operationId === 'idem-op-2');
    // op-2 is now SYNCED, so it no longer appears in getPendingSalesForLocation
    expect(retryRec).toBeUndefined();
  });

  it('strictly throws error when tenantId or locationId context is missing', async () => {
    useSalesStore.getState().addItem({
      productId: 'p1',
      name: 'Item',
      unitPriceCents: 100,
    });

    await expect(useSalesStore.getState().processCashPayment(100, 0)).rejects.toThrow(
      'El contexto con tenantId y locationId es obligatorio'
    );
  });

  it('prevents double submission: concurrent invocations of processCashPayment execute only once', async () => {
    let resolveCall: () => void;
    const slowPromise = new Promise<ProcessSaleResponse>((resolve) => {
      resolveCall = () =>
        resolve({
          success: true,
          sale: {
            id: 'sale-concurrent-1',
            tenantId: 'tenant-1',
            locationId: 'loc-1',
            userId: 'user-1',
            idempotencyKey: 'idem-1',
            totalCents: 2000,
            status: 'COMPLETED',
            createdAtUtc: new Date().toISOString(),
            persistedAt: new Date().toISOString(),
            items: [],
            tenders: [],
          },
          idempotentReplay: false,
          warnings: [],
        });
    });

    const createSaleSpy = vi.spyOn(salesApi, 'createSale').mockReturnValue(slowPromise);

    useSalesStore.getState().addItem({
      productId: 'prod-1',
      name: 'Alfajor',
      unitPriceCents: 2000,
    });

    // Invoke twice concurrently
    const p1 = useSalesStore.getState().processCashPayment(2000, 0, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });
    const p2 = useSalesStore.getState().processCashPayment(2000, 0, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    resolveCall!();
    await Promise.all([p1, p2]);

    expect(createSaleSpy).toHaveBeenCalledTimes(1);
    expect(useSalesStore.getState().isSubmittingSale).toBe(false);
  });

  it('compensates local stock when an offline sale is rejected with FAILED during batch sync', async () => {
    // 1. Cache product with stock 15
    await offlineDb.cacheProducts('tenant-1', 'loc-1', [
      {
        id: 'prod-batch-rec',
        tenantId: 'tenant-1',
        categoryId: null,
        name: 'Galletitas',
        normalizedName: 'galletitas',
        barcode: '123',
        sku: 'GAL-1',
        salePriceCents: 500,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'prod-batch-rec',
          locationId: 'loc-1',
          stockQuantity: '15.0000',
          minimumStock: '2.0000',
          isAvailable: true,
          quickSlot: null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ]);

    // 2. Enqueue offline sale with deduction (quantity 3)
    await offlineDb.enqueueSaleWithStockDeduction(
      {
        idempotencyKey: 'op-batch-fail',
        items: [
          {
            productId: 'prod-batch-rec',
            name: 'Galletitas',
            quantity: 3,
            unitPriceCents: 500,
            totalPriceCents: 1500,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 1500 }],
        totalCents: 1500,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    let cached = await offlineDb.getCachedProduct('tenant-1', 'loc-1', 'prod-batch-rec');
    expect(parseFloat(cached!.stockQuantity)).toBe(12);

    // 3. Batch sync reports FAILED
    vi.spyOn(salesApi, 'syncBatch').mockResolvedValueOnce({
      syncedCount: 0,
      results: [
        {
          operationId: 'op-batch-fail',
          status: 'FAILED',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          error: 'Producto desactivado por el administrador',
        },
      ],
    });

    await useSalesStore.getState().syncPendingSales({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    // Stock must be compensated back to 15!
    cached = await offlineDb.getCachedProduct('tenant-1', 'loc-1', 'prod-batch-rec');
    expect(parseFloat(cached!.stockQuantity)).toBe(15);
  });

  it('clearSalesSession wipes all cart, tender, modal, history, and rejects stale in-flight responses across tenant change', async () => {
    // Populate store for Tenant A
    useSalesStore.getState().addItem({
      productId: 'p-a',
      name: 'Item A',
      unitPriceCents: 100,
    });
    useSalesStore.setState({
      isTenderOpen: true,
      lastSaleSuccess: {
        saleId: 'sale-a',
        idempotencyKey: 'key-a',
        totalFormatted: '$100',
        paidFormatted: '$100',
        changeFormatted: '$0',
        isOffline: false,
      },
      selectedSaleDetail: {
        id: 'sale-a',
        tenantId: 'tenant-A',
        locationId: 'loc-A',
        userId: 'u1',
        shiftId: null,
        idempotencyKey: 'key-a',
        totalCents: 100,
        status: 'COMPLETED',
        createdAtUtc: new Date().toISOString(),
        persistedAt: new Date().toISOString(),
        items: [],
        tenders: [],
      },
    });

    let resolveTenantAFetch: (val: PaginatedSalesResponse) => void;
    const slowFetchPromise = new Promise<PaginatedSalesResponse>((resolve) => {
      resolveTenantAFetch = resolve;
    });
    vi.spyOn(salesApi, 'fetchSales').mockImplementationOnce(() => slowFetchPromise);

    // Start loading history for Tenant A
    const fetchPromise = useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-A',
      locationId: 'loc-A',
    });

    // Clear session on logout
    useSalesStore.getState().clearSalesSession();

    const cleared = useSalesStore.getState();
    expect(cleared.items).toHaveLength(0);
    expect(cleared.isTenderOpen).toBe(false);
    expect(cleared.lastSaleSuccess).toBeNull();
    expect(cleared.selectedSaleDetail).toBeNull();
    expect(cleared.salesHistory).toHaveLength(0);
    expect(cleared.localSalesHistory).toHaveLength(0);
    expect(cleared.activeTenantId).toBeNull();

    // Now Tenant B logs in and starts loading history
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [
        {
          id: 'sale-b',
          tenantId: 'tenant-B',
          locationId: 'loc-B',
          userId: 'u2',
          shiftId: null,
          idempotencyKey: 'key-b',
          totalCents: 500,
          status: 'COMPLETED',
          createdAtUtc: new Date().toISOString(),
          persistedAt: new Date().toISOString(),
          items: [],
          tenders: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-B',
      locationId: 'loc-B',
    });

    // Stale request for Tenant A resolves late!
    resolveTenantAFetch!({
      items: [
        {
          id: 'sale-a-stale',
          tenantId: 'tenant-A',
          locationId: 'loc-A',
          userId: 'u1',
          shiftId: null,
          idempotencyKey: 'key-a',
          totalCents: 100,
          status: 'COMPLETED',
          createdAtUtc: new Date().toISOString(),
          persistedAt: new Date().toISOString(),
          items: [],
          tenders: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    await fetchPromise;

    // Tenant B must NOT be contaminated with Tenant A's sale!
    const stateB = useSalesStore.getState();
    expect(stateB.salesHistory).toHaveLength(1);
    expect(stateB.salesHistory[0]?.id).toBe('sale-b');
  });

  it('separates local pending/failed sales into localSalesHistory, filters them, and avoids server count inflation', async () => {
    // Enqueue 2 local sales in Tenant 1 / Loc 1: one for "Alfajor" (today), one for "Galletitas" (yesterday)
    await offlineDb.enqueueSale(
      {
        idempotencyKey: 'local-alfajor',
        items: [
          {
            productId: 'p-1',
            name: 'Alfajor Triple',
            quantity: 1,
            unitPriceCents: 100,
            totalPriceCents: 100,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100 }],
        totalCents: 100,
        createdAtUtc: '2026-06-01T12:00:00.000Z',
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    await offlineDb.enqueueSale(
      {
        idempotencyKey: 'local-galletitas',
        items: [
          {
            productId: 'p-2',
            name: 'Galletitas',
            quantity: 2,
            unitPriceCents: 50,
            totalPriceCents: 100,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100 }],
        totalCents: 100,
        createdAtUtc: '2026-05-30T10:00:00.000Z',
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    // Mock server returning 1 persisted sale (total = 1)
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [
        {
          id: 'server-sale-1',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u1',
          shiftId: null,
          idempotencyKey: 'server-idem-1',
          totalCents: 200,
          status: 'COMPLETED',
          createdAtUtc: '2026-06-01T15:00:00.000Z',
          persistedAt: '2026-06-01T15:00:00.000Z',
          items: [],
          tenders: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    // 1. Fetch with search "Alfajor"
    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      search: 'Alfajor',
    });

    let state = useSalesStore.getState();
    // Server total is NOT inflated by local sales
    expect(state.salesTotal).toBe(1);
    // localSalesHistory only includes matching "Alfajor", not "Galletitas"
    expect(state.localSalesHistory).toHaveLength(1);
    expect(state.localSalesHistory[0]?.idempotencyKey).toBe('local-alfajor');

    // 2. Fetch page 2: localSalesHistory should NOT repeat across pages
    vi.spyOn(salesApi, 'fetchSales').mockResolvedValueOnce({
      items: [],
      total: 25,
      page: 2,
      limit: 20,
      totalPages: 2,
    });

    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      page: 2,
    });

    state = useSalesStore.getState();
    // Page 2 displays no local operations (only page 1 shows active local queue)
    expect(state.localSalesHistory).toHaveLength(0);
  });

  it('classifies syncBatch errors: NetworkError sets offline, 401/403/500 sets error without false green ribbon', async () => {
    await offlineDb.enqueueSale(
      {
        idempotencyKey: 'sync-err-op',
        items: [
          {
            productId: 'p-1',
            name: 'Item',
            quantity: 1,
            unitPriceCents: 100,
            totalPriceCents: 100,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100 }],
        totalCents: 100,
        createdAtUtc: new Date().toISOString(),
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    // 1. Network failure during batch sync
    vi.spyOn(salesApi, 'syncBatch').mockRejectedValueOnce(
      new NetworkError('No se pudo conectar al servidor')
    );

    await useSalesStore.getState().syncPendingSales({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    let state = useSalesStore.getState();
    expect(state.connectionStatus).toBe('offline');
    expect(await offlineDb.getPendingCount('tenant-1', 'loc-1')).toBe(1);

    // 2. HTTP 500 error during batch sync
    vi.spyOn(salesApi, 'syncBatch').mockRejectedValueOnce(
      new ApiError(500, 'Error interno del servidor')
    );

    await useSalesStore.getState().syncPendingSales({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    state = useSalesStore.getState();
    expect(state.connectionStatus).toBe('error');
    expect(state.syncErrorMessage).toContain('Error');
    expect(await offlineDb.getPendingCount('tenant-1', 'loc-1')).toBe(1);
  });

  it('discards slow older history request that resolves after a faster newer request', async () => {
    let resolveSlow: (data: PaginatedSalesResponse) => void = () => {};
    const slowPromise = new Promise<PaginatedSalesResponse>((res) => {
      resolveSlow = res;
    });

    const mockSlowResult: PaginatedSalesResponse = {
      items: [
        {
          id: 'slow-sale',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u1',
          shiftId: null,
          idempotencyKey: 'idem-slow',
          totalCents: 100,
          status: 'COMPLETED',
          createdAtUtc: '2026-06-01T10:00:00.000Z',
          persistedAt: '2026-06-01T10:00:00.000Z',
          items: [],
          tenders: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    const mockFastResult: PaginatedSalesResponse = {
      items: [
        {
          id: 'fast-sale',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u1',
          shiftId: null,
          idempotencyKey: 'idem-fast',
          totalCents: 200,
          status: 'COMPLETED',
          createdAtUtc: '2026-06-01T11:00:00.000Z',
          persistedAt: '2026-06-01T11:00:00.000Z',
          items: [],
          tenders: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    vi.spyOn(salesApi, 'fetchSales')
      .mockImplementationOnce(() => slowPromise)
      .mockResolvedValueOnce(mockFastResult);

    // Trigger slow request
    const p1 = useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      search: 'slow',
    });

    // Trigger fast request
    const p2 = useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      search: 'fast',
    });

    await p2;

    let state = useSalesStore.getState();
    expect(state.salesHistory).toHaveLength(1);
    expect(state.salesHistory[0]?.id).toBe('fast-sale');

    // Now resolve the slow request
    resolveSlow(mockSlowResult);
    await p1;

    state = useSalesStore.getState();
    // Fast sale must be preserved, slow must be discarded
    expect(state.salesHistory).toHaveLength(1);
    expect(state.salesHistory[0]?.id).toBe('fast-sale');
  });

  it('discards slow older history request that fails after a faster newer request succeeds', async () => {
    let rejectSlow: (err: unknown) => void = () => {};
    const slowPromise = new Promise<PaginatedSalesResponse>((_, rej) => {
      rejectSlow = rej;
    });

    const mockFastResult: PaginatedSalesResponse = {
      items: [
        {
          id: 'fast-sale-ok',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u1',
          shiftId: null,
          idempotencyKey: 'idem-fast-ok',
          totalCents: 300,
          status: 'COMPLETED',
          createdAtUtc: '2026-06-01T12:00:00.000Z',
          persistedAt: '2026-06-01T12:00:00.000Z',
          items: [],
          tenders: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    vi.spyOn(salesApi, 'fetchSales')
      .mockImplementationOnce(() => slowPromise)
      .mockResolvedValueOnce(mockFastResult);

    const p1 = useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      search: 'slow-err',
    });

    const p2 = useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      search: 'fast-ok',
    });

    await p2;

    let state = useSalesStore.getState();
    expect(state.salesHistory).toHaveLength(1);
    expect(state.salesHistory[0]?.id).toBe('fast-sale-ok');
    expect(state.salesHistoryError).toBeNull();

    // Now reject the slow request
    rejectSlow(new Error('Network error on slow request'));
    await p1;

    state = useSalesStore.getState();
    // State should NOT be overwritten by the failed slow request's error or fallback
    expect(state.salesHistory).toHaveLength(1);
    expect(state.salesHistory[0]?.id).toBe('fast-sale-ok');
    expect(state.salesHistoryError).toBeNull();
  });

  it('invalidates in-flight requests when clearSalesSession is called or tenant/location changes', async () => {
    let resolveSlow: (data: PaginatedSalesResponse) => void = () => {};
    const slowPromise = new Promise<PaginatedSalesResponse>((res) => {
      resolveSlow = res;
    });

    vi.spyOn(salesApi, 'fetchSales').mockImplementationOnce(() => slowPromise);

    const p1 = useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    // Clear session (simulating logout or branch change)
    useSalesStore.getState().clearSalesSession();

    resolveSlow({
      items: [
        {
          id: 'stale-sale',
          tenantId: 'tenant-1',
          locationId: 'loc-1',
          userId: 'u1',
          shiftId: null,
          idempotencyKey: 'idem-stale',
          totalCents: 100,
          status: 'COMPLETED',
          createdAtUtc: '2026-06-01T10:00:00.000Z',
          persistedAt: '2026-06-01T10:00:00.000Z',
          items: [],
          tenders: [],
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    await p1;

    const state = useSalesStore.getState();
    expect(state.salesHistory).toHaveLength(0);
    expect(state.activeTenantId).toBeNull();
  });

  it('filters offline fallback sales strictly by search, from, to (including 23:59:59.999 UTC), and tenant/location isolation', async () => {
    // Enqueue 4 sales:
    // 1. tenant-1, loc-1, "Alfajor Havanna", created at 2026-05-15T10:00:00.000Z
    // 2. tenant-1, loc-1, "Gaseosa Cola", created at 2026-05-15T23:59:59.999Z (boundary of 2026-05-15)
    // 3. tenant-1, loc-1, "Caramelos", created at 2026-05-16T00:00:00.000Z (next day)
    // 4. tenant-2, loc-2, "Alfajor Havanna", created at 2026-05-15T10:00:00.000Z (other tenant/branch)

    await offlineDb.enqueueSale(
      {
        idempotencyKey: 't1-alfajor',
        items: [
          {
            productId: 'p1',
            name: 'Alfajor Havanna',
            quantity: 1,
            unitPriceCents: 500,
            totalPriceCents: 500,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 500 }],
        totalCents: 500,
        createdAtUtc: '2026-05-15T10:00:00.000Z',
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    await offlineDb.enqueueSale(
      {
        idempotencyKey: 't1-gaseosa-boundary',
        items: [
          {
            productId: 'p2',
            name: 'Gaseosa Cola',
            barcode: '77912345',
            quantity: 1,
            unitPriceCents: 300,
            totalPriceCents: 300,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 300 }],
        totalCents: 300,
        createdAtUtc: '2026-05-15T23:59:59.999Z',
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    await offlineDb.enqueueSale(
      {
        idempotencyKey: 't1-caramelos-nextday',
        items: [
          {
            productId: 'p3',
            name: 'Caramelos',
            quantity: 1,
            unitPriceCents: 100,
            totalPriceCents: 100,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100 }],
        totalCents: 100,
        createdAtUtc: '2026-05-16T00:00:00.000Z',
      },
      { tenantId: 'tenant-1', locationId: 'loc-1' }
    );

    await offlineDb.enqueueSale(
      {
        idempotencyKey: 't2-alfajor-other',
        items: [
          {
            productId: 'p1',
            name: 'Alfajor Havanna',
            quantity: 1,
            unitPriceCents: 500,
            totalPriceCents: 500,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 500 }],
        totalCents: 500,
        createdAtUtc: '2026-05-15T10:00:00.000Z',
      },
      { tenantId: 'tenant-2', locationId: 'loc-2' }
    );

    // Server fails -> triggers offline fallback
    vi.spyOn(salesApi, 'fetchSales').mockRejectedValue(new NetworkError('Offline mode'));

    // Case A: search for "Havanna" -> should only find t1-alfajor (not tenant-2, not others)
    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      search: 'havanna',
    });
    let state = useSalesStore.getState();
    expect(state.localSalesHistory).toHaveLength(1);
    expect(state.localSalesHistory[0]?.idempotencyKey).toBe('t1-alfajor');

    // Case B: search by barcode "77912345" -> should find t1-gaseosa-boundary
    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      search: '77912345',
    });
    state = useSalesStore.getState();
    expect(state.localSalesHistory).toHaveLength(1);
    expect(state.localSalesHistory[0]?.idempotencyKey).toBe('t1-gaseosa-boundary');

    // Case C: search with non-matching term -> returns empty localSalesHistory
    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      search: 'non-existent-product',
    });
    state = useSalesStore.getState();
    expect(state.localSalesHistory).toHaveLength(0);

    // Case D: date range to="2026-05-15" includes 2026-05-15T23:59:59.999Z but EXCLUDES 2026-05-16T00:00:00.000Z
    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      from: '2026-05-15',
      to: '2026-05-15',
    });
    state = useSalesStore.getState();
    expect(state.localSalesHistory).toHaveLength(2);
    const keys = state.localSalesHistory.map((s) => s.idempotencyKey);
    expect(keys).toContain('t1-alfajor');
    expect(keys).toContain('t1-gaseosa-boundary');
    expect(keys).not.toContain('t1-caramelos-nextday');
    expect(keys).not.toContain('t2-alfajor-other');

    // Case E: date range from="2026-05-16" -> only caramelos
    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      from: '2026-05-16',
    });
    state = useSalesStore.getState();
    expect(state.localSalesHistory).toHaveLength(1);
    expect(state.localSalesHistory[0]?.idempotencyKey).toBe('t1-caramelos-nextday');

    // Case F: query tenant-2 loc-2 -> strictly isolated
    await useSalesStore.getState().loadSalesHistory({
      tenantId: 'tenant-2',
      locationId: 'loc-2',
    });
    state = useSalesStore.getState();
    expect(state.localSalesHistory).toHaveLength(1);
    expect(state.localSalesHistory[0]?.idempotencyKey).toBe('t2-alfajor-other');
  });

  describe('Point 1: Sale Detail Concurrency and Session Leakage Guards', () => {
    const mockSaleA: SaleResponse = {
      id: 'sale-A',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      userId: 'u1',
      shiftId: null,
      idempotencyKey: 'idem-sale-A',
      totalCents: 1000,
      status: 'COMPLETED',
      createdAtUtc: '2026-06-01T10:00:00.000Z',
      persistedAt: '2026-06-01T10:00:00.000Z',
      items: [
        {
          id: 'it-A',
          saleId: 'sale-A',
          productId: 'prod-A',
          name: 'Producto A',
          barcode: null,
          quantity: '1',
          unitPriceCents: 1000,
          totalPriceCents: 1000,
        },
      ],
      tenders: [],
    };

    const mockSaleB: SaleResponse = {
      id: 'sale-B',
      tenantId: 'tenant-1',
      locationId: 'loc-1',
      userId: 'u1',
      shiftId: null,
      idempotencyKey: 'idem-sale-B',
      totalCents: 2000,
      status: 'COMPLETED',
      createdAtUtc: '2026-06-01T11:00:00.000Z',
      persistedAt: '2026-06-01T11:00:00.000Z',
      items: [
        {
          id: 'it-B',
          saleId: 'sale-B',
          productId: 'prod-B',
          name: 'Producto B',
          barcode: null,
          quantity: '2',
          unitPriceCents: 1000,
          totalPriceCents: 2000,
        },
      ],
      tenders: [],
    };

    it('1. Detail of sale A responds after logout (clearSalesSession): does not repopulate store', async () => {
      let resolveSaleA!: (sale: SaleResponse) => void;
      vi.spyOn(salesApi, 'fetchSaleById').mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSaleA = res;
          })
      );

      useSalesStore.setState({ activeTenantId: 'tenant-1', activeLocationId: 'loc-1' });

      const promiseA = useSalesStore.getState().loadSaleDetail('sale-A');
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // User logs out during in-flight request
      useSalesStore.getState().clearSalesSession();
      expect(useSalesStore.getState().selectedSaleDetail).toBeNull();
      expect(useSalesStore.getState().isDetailLoading).toBe(false);

      // Late response arrives
      resolveSaleA(mockSaleA);
      await promiseA;

      const state = useSalesStore.getState();
      expect(state.selectedSaleDetail).toBeNull();
      expect(state.isDetailLoading).toBe(false);
    });

    it('2. Detail of sale A responds after login to tenant B: discarded', async () => {
      let resolveSaleA!: (sale: SaleResponse) => void;
      vi.spyOn(salesApi, 'fetchSaleById').mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSaleA = res;
          })
      );

      useSalesStore.setState({ activeTenantId: 'tenant-1', activeLocationId: 'loc-1' });

      const promiseA = useSalesStore.getState().loadSaleDetail('sale-A');
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // User switches to tenant-2
      useSalesStore.setState({ activeTenantId: 'tenant-2', activeLocationId: 'loc-2' });

      // Late response arrives
      resolveSaleA(mockSaleA);
      await promiseA;

      const state = useSalesStore.getState();
      expect(state.selectedSaleDetail).toBeNull();
      expect(useSalesStore.getState().isDetailLoading).toBe(true);
    });

    it('3. Detail of sale A responds after branch switch: discarded', async () => {
      let resolveSaleA!: (sale: SaleResponse) => void;
      vi.spyOn(salesApi, 'fetchSaleById').mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSaleA = res;
          })
      );

      useSalesStore.setState({ activeTenantId: 'tenant-1', activeLocationId: 'loc-1' });

      const promiseA = useSalesStore.getState().loadSaleDetail('sale-A');
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // Branch switches to loc-2
      useSalesStore.setState({ activeTenantId: 'tenant-1', activeLocationId: 'loc-2' });

      // Late response arrives
      resolveSaleA(mockSaleA);
      await promiseA;

      const state = useSalesStore.getState();
      expect(state.selectedSaleDetail).toBeNull();
    });

    it('4. Fast open sale A then sale B; A responds after B: B continues to be shown and A does not turn off B loading', async () => {
      let resolveSaleA!: (sale: SaleResponse) => void;
      let resolveSaleB!: (sale: SaleResponse) => void;

      vi.spyOn(salesApi, 'fetchSaleById')
        .mockImplementationOnce(
          () =>
            new Promise((res) => {
              resolveSaleA = res;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((res) => {
              resolveSaleB = res;
            })
        );

      useSalesStore.setState({ activeTenantId: 'tenant-1', activeLocationId: 'loc-1' });

      // Open A
      const promiseA = useSalesStore.getState().loadSaleDetail('sale-A');
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // Quickly open B
      const promiseB = useSalesStore.getState().loadSaleDetail('sale-B');
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // A resolves BEFORE B finishes: A must NOT turn off isDetailLoading nor set selectedSaleDetail to A
      resolveSaleA(mockSaleA);
      await promiseA;

      expect(useSalesStore.getState().selectedSaleDetail).toBeNull();
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // Now B resolves: B is shown and isDetailLoading becomes false
      resolveSaleB(mockSaleB);
      await promiseB;

      expect(useSalesStore.getState().selectedSaleDetail).toEqual(mockSaleB);
      expect(useSalesStore.getState().isDetailLoading).toBe(false);
    });

    it('5. Manual close of modal (closeSaleDetail) before response: response does not reopen modal', async () => {
      let resolveSaleA!: (sale: SaleResponse) => void;
      vi.spyOn(salesApi, 'fetchSaleById').mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSaleA = res;
          })
      );

      useSalesStore.setState({ activeTenantId: 'tenant-1', activeLocationId: 'loc-1' });

      const promiseA = useSalesStore.getState().loadSaleDetail('sale-A');
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // User manually closes modal
      useSalesStore.getState().closeSaleDetail();
      expect(useSalesStore.getState().selectedSaleDetail).toBeNull();
      expect(useSalesStore.getState().isDetailLoading).toBe(false);

      // Late response arrives
      resolveSaleA(mockSaleA);
      await promiseA;

      const state = useSalesStore.getState();
      expect(state.selectedSaleDetail).toBeNull();
      expect(state.isDetailLoading).toBe(false);
    });

    it('6. Late error does not alter active state nor turn off loading of newer request', async () => {
      let rejectSaleA!: (err: Error) => void;
      let resolveSaleB!: (sale: SaleResponse) => void;

      vi.spyOn(salesApi, 'fetchSaleById')
        .mockImplementationOnce(
          () =>
            new Promise((_, rej) => {
              rejectSaleA = rej;
            })
        )
        .mockImplementationOnce(
          () =>
            new Promise((res) => {
              resolveSaleB = res;
            })
        );

      useSalesStore.setState({ activeTenantId: 'tenant-1', activeLocationId: 'loc-1' });

      // Open A
      const promiseA = useSalesStore.getState().loadSaleDetail('sale-A');
      // Open B
      const promiseB = useSalesStore.getState().loadSaleDetail('sale-B');
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // A fails with NetworkError
      rejectSaleA(new NetworkError('Failed to fetch A'));
      await promiseA;

      // isDetailLoading must STILL be true for B
      expect(useSalesStore.getState().isDetailLoading).toBe(true);

      // B resolves successfully
      resolveSaleB(mockSaleB);
      await promiseB;

      expect(useSalesStore.getState().selectedSaleDetail).toEqual(mockSaleB);
      expect(useSalesStore.getState().isDetailLoading).toBe(false);
    });
  });

  describe('Point 2: Error Classification in loadSalesHistory', () => {
    it('pre-validates date range: invalid date format immediately sets salesHistoryError without calling API', async () => {
      const fetchSpy = vi.spyOn(salesApi, 'fetchSales');

      await useSalesStore.getState().loadSalesHistory({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        from: '2026-02-31',
      });

      const state = useSalesStore.getState();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(state.isSalesHistoryLoading).toBe(false);
      expect(state.salesHistoryError).toContain('Fecha de calendario inexistente');
      expect(state.salesHistory).toHaveLength(0);
      expect(state.localSalesHistory).toHaveLength(0);
    });

    it('pre-validates date range: from > to immediately sets salesHistoryError without calling API', async () => {
      const fetchSpy = vi.spyOn(salesApi, 'fetchSales');

      await useSalesStore.getState().loadSalesHistory({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
        from: '2026-05-20',
        to: '2026-05-10',
      });

      const state = useSalesStore.getState();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(state.isSalesHistoryLoading).toBe(false);
      expect(state.salesHistoryError).toContain('no puede ser posterior');
      expect(state.salesHistory).toHaveLength(0);
      expect(state.localSalesHistory).toHaveLength(0);
    });

    it('HTTP 400 error displays API validation message and does not fallback to offline', async () => {
      vi.spyOn(salesApi, 'fetchSales').mockRejectedValueOnce(
        new ApiError(
          400,
          'Formato de fecha inválido en "from". Se requiere exclusivamente YYYY-MM-DD.'
        )
      );

      await useSalesStore.getState().loadSalesHistory({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });

      const state = useSalesStore.getState();
      expect(state.isSalesHistoryLoading).toBe(false);
      expect(state.salesHistoryError).toBe(
        'Formato de fecha inválido en "from". Se requiere exclusivamente YYYY-MM-DD.'
      );
      expect(state.salesHistory).toHaveLength(0);
      expect(state.localSalesHistory).toHaveLength(0);
    });

    it('HTTP 401/403 error clears sensitive sales data and displays auth error message', async () => {
      useSalesStore.setState({
        salesHistory: [
          {
            id: 'sale-old',
            tenantId: 'tenant-1',
            locationId: 'loc-1',
            userId: 'u1',
            shiftId: null,
            idempotencyKey: 'idem-old',
            totalCents: 100,
            status: 'COMPLETED',
            createdAtUtc: '2026-01-01T00:00:00.000Z',
            persistedAt: '2026-01-01T00:00:00.000Z',
            items: [],
            tenders: [],
          },
        ],
        localSalesHistory: [
          {
            id: 'local-old',
            tenantId: 'tenant-1',
            locationId: 'loc-1',
            userId: 'u1',
            shiftId: null,
            idempotencyKey: 'idem-local',
            totalCents: 100,
            status: 'PENDING',
            createdAtUtc: '2026-01-01T00:00:00.000Z',
            persistedAt: '2026-01-01T00:00:00.000Z',
            items: [],
            tenders: [],
          },
        ],
      });

      vi.spyOn(salesApi, 'fetchSales').mockRejectedValueOnce(new ApiError(401, 'No autenticado'));

      await useSalesStore.getState().loadSalesHistory({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });

      const state = useSalesStore.getState();
      expect(state.isSalesHistoryLoading).toBe(false);
      expect(state.salesHistoryError).toBe(
        'Sesión expirada o no autorizada para consultar historial.'
      );
      expect(state.salesHistory).toHaveLength(0);
      expect(state.localSalesHistory).toHaveLength(0);
      expect(state.selectedSaleDetail).toBeNull();
    });

    it('HTTP 500 error displays server error message and does not claim offline', async () => {
      vi.spyOn(salesApi, 'fetchSales').mockRejectedValueOnce(
        new ApiError(500, 'Error en el servidor de base de datos')
      );

      await useSalesStore.getState().loadSalesHistory({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });

      const state = useSalesStore.getState();
      expect(state.isSalesHistoryLoading).toBe(false);
      expect(state.salesHistoryError).toBe('Error en el servidor de base de datos');
      expect(state.salesHistory).toHaveLength(0);
      expect(state.localSalesHistory).toHaveLength(0);
    });

    it('NetworkError displays offline banner and loads local pending sales', async () => {
      await offlineDb.enqueueSale(
        {
          idempotencyKey: 'idem-offline-fallback',
          items: [
            {
              productId: 'p-off',
              name: 'Venta Offline',
              quantity: 1,
              unitPriceCents: 500,
              totalPriceCents: 500,
            },
          ],
          tenders: [{ type: 'CASH', amountCents: 500 }],
          totalCents: 500,
          createdAtUtc: new Date().toISOString(),
        },
        { tenantId: 'tenant-1', locationId: 'loc-1' }
      );

      vi.spyOn(salesApi, 'fetchSales').mockRejectedValueOnce(new NetworkError('Failed to fetch'));

      await useSalesStore.getState().loadSalesHistory({
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      });

      const state = useSalesStore.getState();
      expect(state.isSalesHistoryLoading).toBe(false);
      expect(state.salesHistoryError).toBe(
        'Modo sin conexión. Mostrando operaciones locales pendientes.'
      );
      expect(state.localSalesHistory).toHaveLength(1);
      expect(state.localSalesHistory[0]?.idempotencyKey).toBe('idem-offline-fallback');
    });
  });
});
