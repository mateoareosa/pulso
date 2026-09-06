import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { Dexie } from 'dexie';
import {
  PulsoOfflineDatabase,
  QUARANTINE_TENANT_ID,
  QUARANTINE_LOCATION_ID,
} from '../src/features/sync/offline-db';
import type { CreateSaleCommand, ProductResponse } from '@pulso/contracts';

describe('PulsoOfflineDatabase (Dexie v2 & Migration)', () => {
  let db: PulsoOfflineDatabase;

  beforeEach(async () => {
    db = new PulsoOfflineDatabase();
    await db.syncQueue.clear();
    await db.cachedProducts.clear();
  });

  it('preserves pending sync sales while providing cachedProducts table', async () => {
    const sale: CreateSaleCommand = {
      shiftId: 'shift-1',
      idempotencyKey: '123e4567-e89b-12d3-a456-426614174000',
      items: [
        {
          productId: 'p1',
          name: 'Item 1',
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
    };

    await db.enqueueSale(sale, { tenantId: 'tenant-1', locationId: 'loc-1' });
    expect(await db.getPendingCount('tenant-1', 'loc-1')).toBe(1);

    const pending = await db.getAllPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.payload.idempotencyKey).toBe('123e4567-e89b-12d3-a456-426614174000');

    // cachedProducts table exists and is initially empty
    const cached = await db.getCachedProducts('tenant-1', 'loc-1');
    expect(cached).toHaveLength(0);
  });

  it('caches products and isolates them strictly by tenantId and locationId', async () => {
    const mockProductsTenantA: ProductResponse[] = [
      {
        id: 'prod-a1',
        tenantId: 'tenant-a',
        categoryId: 'cat-1',
        name: 'Alfajor Triple',
        normalizedName: 'alfajor triple',
        barcode: '779001',
        sku: 'ALF-1',
        salePriceCents: 120000,
        costPriceCents: 75000,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        category: { id: 'cat-1', name: 'Golosinas' },
        locationSettings: {
          productId: 'prod-a1',
          locationId: 'loc-a1',
          stockQuantity: '50.0000',
          minimumStock: '10.0000',
          isAvailable: true,
          quickSlot: 1,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ];

    const mockProductsTenantB: ProductResponse[] = [
      {
        id: 'prod-b1',
        tenantId: 'tenant-b',
        categoryId: null,
        name: 'Gaseosa Cola',
        normalizedName: 'gaseosa cola',
        barcode: '779002',
        sku: null,
        salePriceCents: 150000,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'prod-b1',
          locationId: 'loc-b1',
          stockQuantity: '20.0000',
          minimumStock: '5.0000',
          isAvailable: true,
          quickSlot: 2,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ];

    await db.cacheProducts('tenant-a', 'loc-a1', mockProductsTenantA);
    await db.cacheProducts('tenant-b', 'loc-b1', mockProductsTenantB);

    // Tenant A query
    const cachedA = await db.getCachedProducts('tenant-a', 'loc-a1');
    expect(cachedA).toHaveLength(1);
    expect(cachedA[0]?.name).toBe('Alfajor Triple');
    expect(cachedA[0]?.quickSlot).toBe(1);

    // Tenant B query
    const cachedB = await db.getCachedProducts('tenant-b', 'loc-b1');
    expect(cachedB).toHaveLength(1);
    expect(cachedB[0]?.name).toBe('Gaseosa Cola');

    // Tenant A querying wrong location returns empty
    const cachedEmpty = await db.getCachedProducts('tenant-a', 'loc-other');
    expect(cachedEmpty).toHaveLength(0);
  });

  it('searches cached products offline with exact barcode priority', async () => {
    const products: ProductResponse[] = [
      {
        id: 'p1',
        tenantId: 't1',
        categoryId: null,
        name: 'Caramelos Ácidos Frutales',
        normalizedName: 'caramelos acidos frutales',
        barcode: '779005',
        sku: null,
        salePriceCents: 80000,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'p1',
          locationId: 'l1',
          stockQuantity: '10.0000',
          minimumStock: '2.0000',
          isAvailable: true,
          quickSlot: null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      {
        id: 'p2',
        tenantId: 't1',
        categoryId: null,
        name: 'Chicle Ácido',
        normalizedName: 'chicle acido',
        barcode: '779006',
        sku: null,
        salePriceCents: 50000,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'p2',
          locationId: 'l1',
          stockQuantity: '15.0000',
          minimumStock: '5.0000',
          isAvailable: true,
          quickSlot: null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ];

    await db.cacheProducts('t1', 'l1', products);

    // Accent-insensitive search
    const resultsName = await db.searchCachedProducts('t1', 'l1', 'acido');
    expect(resultsName).toHaveLength(2);

    // Exact barcode search
    const resultsBarcode = await db.searchCachedProducts('t1', 'l1', '779006');
    expect(resultsBarcode).toHaveLength(1);
    expect(resultsBarcode[0]?.name).toBe('Chicle Ácido');
  });

  it('caches the EXACT SAME productId in two locations simultaneously without overwriting (composite key [tenantId+locationId+id])', async () => {
    const sharedProductId = 'prod-shared-123';

    const productAtLocCentral: ProductResponse = {
      id: sharedProductId,
      tenantId: 'tenant-1',
      categoryId: null,
      name: 'Alfajor Compartido',
      normalizedName: 'alfajor compartido',
      barcode: '7799990001',
      sku: 'ALF-SH',
      salePriceCents: 10000,
      costPriceCents: 5000,
      unit: 'UNIT',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locationSettings: {
        productId: sharedProductId,
        locationId: 'loc-central',
        stockQuantity: '100.0000',
        minimumStock: '20.0000',
        isAvailable: true,
        quickSlot: 1,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    const productAtLocNorte: ProductResponse = {
      id: sharedProductId,
      tenantId: 'tenant-1',
      categoryId: null,
      name: 'Alfajor Compartido',
      normalizedName: 'alfajor compartido',
      barcode: '7799990001',
      sku: 'ALF-SH',
      salePriceCents: 10000,
      costPriceCents: 5000,
      unit: 'UNIT',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locationSettings: {
        productId: sharedProductId,
        locationId: 'loc-norte',
        stockQuantity: '35.0000',
        minimumStock: '5.0000',
        isAvailable: false,
        quickSlot: 4,
        version: 2,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    await db.cacheProducts('tenant-1', 'loc-central', [productAtLocCentral]);
    await db.cacheProducts('tenant-1', 'loc-norte', [productAtLocNorte]);

    // Both records must exist simultaneously!
    const centralProducts = await db.getCachedProducts('tenant-1', 'loc-central', {
      onlyAvailable: false,
    });
    const norteProducts = await db.getCachedProducts('tenant-1', 'loc-norte', {
      onlyAvailable: false,
    });

    expect(centralProducts).toHaveLength(1);
    expect(norteProducts).toHaveLength(1);

    expect(centralProducts[0]?.id).toBe(sharedProductId);
    expect(centralProducts[0]?.locationId).toBe('loc-central');
    expect(centralProducts[0]?.stockQuantity).toBe('100.0000');
    expect(centralProducts[0]?.minimumStock).toBe('20.0000');
    expect(centralProducts[0]?.quickSlot).toBe(1);
    expect(centralProducts[0]?.isAvailable).toBe(true);

    expect(norteProducts[0]?.id).toBe(sharedProductId);
    expect(norteProducts[0]?.locationId).toBe('loc-norte');
    expect(norteProducts[0]?.stockQuantity).toBe('35.0000');
    expect(norteProducts[0]?.minimumStock).toBe('5.0000');
    expect(norteProducts[0]?.quickSlot).toBe(4);
    expect(norteProducts[0]?.isAvailable).toBe(false);
  });

  it('clears cached catalog on logout without deleting or modifying pending syncQueue sales', async () => {
    // 1. Enqueue a pending sale in syncQueue
    const sale: CreateSaleCommand = {
      shiftId: 'shift-1',
      idempotencyKey: 'offline-pending-sale-999',
      items: [
        {
          productId: 'p1',
          name: 'Item Pendiente',
          quantity: 2,
          unitPriceCents: 500,
          totalPriceCents: 1000,
        },
      ],
      tenders: [
        { type: 'CASH', amountCents: 1000, receivedAmountCents: 1000, changeAmountCents: 0 },
      ],
      totalCents: 1000,
      createdAtUtc: new Date().toISOString(),
    };
    await db.enqueueSale(sale, { tenantId: 'tenant-1', locationId: 'loc-1' });
    expect(await db.getPendingCount('tenant-1', 'loc-1')).toBe(1);

    // 2. Cache catalog products
    await db.cacheProducts('tenant-1', 'loc-1', [
      {
        id: 'prod-to-clear',
        tenantId: 'tenant-1',
        categoryId: null,
        name: 'Producto A Limpiar',
        normalizedName: 'producto a limpiar',
        barcode: '123',
        sku: null,
        salePriceCents: 1000,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'prod-to-clear',
          locationId: 'loc-1',
          stockQuantity: '10.0000',
          minimumStock: '0.0000',
          isAvailable: true,
          quickSlot: null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ]);
    expect(await db.getCachedProducts('tenant-1', 'loc-1')).toHaveLength(1);

    // 3. Perform logout catalog cleanup
    await db.clearCachedCatalog();

    // 4. Verify catalog is completely empty, BUT pending sale in syncQueue is preserved!
    const remainingCatalog = await db.getCachedProducts('tenant-1', 'loc-1', {
      onlyActive: false,
      onlyAvailable: false,
    });
    expect(remainingCatalog).toHaveLength(0);

    const pendingSales = await db.getAllPending();
    expect(pendingSales).toHaveLength(1);
    expect(pendingSales[0]?.payload.idempotencyKey).toBe('offline-pending-sale-999');
  });

  it('clears cached products for a branch on successful sync when zero products are vendible, without touching syncQueue', async () => {
    // 1. Enqueue a pending sale
    const pendingSale: CreateSaleCommand = {
      shiftId: 'shift-1',
      idempotencyKey: 'pending-sale-preserve-1',
      items: [
        { productId: 'p-1', name: 'Item', quantity: 1, unitPriceCents: 100, totalPriceCents: 100 },
      ],
      tenders: [{ type: 'CASH', amountCents: 100, receivedAmountCents: 100, changeAmountCents: 0 }],
      totalCents: 100,
      createdAtUtc: new Date().toISOString(),
    };
    await db.enqueueSale(pendingSale, { tenantId: 'tenant-zero', locationId: 'loc-zero' });

    // 2. Cache an initial vendible product
    await db.cacheProducts('tenant-zero', 'loc-zero', [
      {
        id: 'prod-will-deactivate',
        tenantId: 'tenant-zero',
        categoryId: null,
        name: 'Producto Vendible Inicial',
        normalizedName: 'producto vendible inicial',
        barcode: '999111',
        sku: null,
        salePriceCents: 500,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'prod-will-deactivate',
          locationId: 'loc-zero',
          stockQuantity: '10.0000',
          minimumStock: '0.0000',
          isAvailable: true,
          quickSlot: null,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ]);

    expect(await db.getCachedProducts('tenant-zero', 'loc-zero')).toHaveLength(1);

    // 3. Successful sync with 0 vendible products (all deactivated)
    await db.cacheProducts('tenant-zero', 'loc-zero', []);

    // 4. Verify branch cache is empty
    const emptyCached = await db.getCachedProducts('tenant-zero', 'loc-zero');
    expect(emptyCached).toHaveLength(0);

    // 5. Offline search confirms nothing found
    const searchResult = await db.searchCachedProducts('tenant-zero', 'loc-zero', 'Producto');
    expect(searchResult).toHaveLength(0);

    // 6. Confirm syncQueue was never touched
    const remainingPending = await db.getAllPending();
    expect(remainingPending).toHaveLength(1);
    expect(remainingPending[0]?.operationId).toBe('pending-sale-preserve-1');
  });

  it('migrates real IndexedDB schema from v2 to v3 and preserves syncQueue items intact', async () => {
    const { Dexie } = await import('dexie');
    const migrationDbName = 'PulsoOfflineDB_MigrationTest';
    await Dexie.delete(migrationDbName);

    // Step 1: Initialize Dexie database at v2 with old cachedProducts schema
    const dbV2 = new Dexie(migrationDbName);
    dbV2.version(1).stores({
      syncQueue: 'operationId, type, status, createdAt',
    });
    dbV2.version(2).stores({
      syncQueue: 'operationId, type, status, createdAt',
      cachedProducts:
        'id, [tenantId+locationId], barcode, normalizedName, quickSlot, isActive, isAvailable',
    });
    await dbV2.open();

    const saleV2: CreateSaleCommand = {
      shiftId: 'shift-mig-1',
      idempotencyKey: 'migrated-sale-uuid-777',
      items: [
        {
          productId: 'p-mig',
          name: 'Item Migrado',
          quantity: 3,
          unitPriceCents: 400,
          totalPriceCents: 1200,
        },
      ],
      tenders: [
        { type: 'CASH', amountCents: 1200, receivedAmountCents: 1200, changeAmountCents: 0 },
      ],
      totalCents: 1200,
      createdAtUtc: new Date().toISOString(),
    };

    await dbV2.table('syncQueue').put({
      operationId: saleV2.idempotencyKey,
      type: 'CREATE_SALE',
      payload: saleV2,
      createdAt: saleV2.createdAtUtc,
      status: 'PENDING',
    });

    dbV2.close();

    // Step 2: Open with v3 schema dropping cachedProducts and v4 recreating with composite key
    const dbV3 = new Dexie(migrationDbName);
    dbV3.version(1).stores({
      syncQueue: 'operationId, type, status, createdAt',
    });
    dbV3.version(2).stores({
      syncQueue: 'operationId, type, status, createdAt',
      cachedProducts:
        'id, [tenantId+locationId], barcode, normalizedName, quickSlot, isActive, isAvailable',
    });
    dbV3.version(3).stores({
      syncQueue: 'operationId, type, status, createdAt',
      cachedProducts: null, // Dexie canonical pattern: drop old table
    });
    dbV3.version(4).stores({
      syncQueue: 'operationId, type, status, createdAt',
      cachedProducts:
        '[tenantId+locationId+id], [tenantId+locationId], barcode, normalizedName, quickSlot, isActive, isAvailable',
    });
    await dbV3.open();

    // Step 3: Verify syncQueue survived the migration unchanged
    const pendingInV3 = await dbV3.table('syncQueue').where('status').equals('PENDING').toArray();
    expect(pendingInV3).toHaveLength(1);
    expect(pendingInV3[0].operationId).toBe('migrated-sale-uuid-777');
    expect(pendingInV3[0].payload.totalCents).toBe(1200);

    dbV3.close();
    await Dexie.delete(migrationDbName);
  });

  it('getCachedQuickProducts returns only active, available slots 1..8 sorted by slot number', async () => {
    await db.cacheProducts('tenant-qk', 'loc-qk', [
      {
        id: 'p-slot-3',
        tenantId: 'tenant-qk',
        categoryId: null,
        name: 'Producto Slot 3',
        normalizedName: 'producto slot 3',
        barcode: '111',
        sku: null,
        salePriceCents: 100,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'p-slot-3',
          locationId: 'loc-qk',
          stockQuantity: '10.0000',
          minimumStock: '0.0000',
          isAvailable: true,
          quickSlot: 3,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      {
        id: 'p-slot-1',
        tenantId: 'tenant-qk',
        categoryId: null,
        name: 'Producto Slot 1',
        normalizedName: 'producto slot 1',
        barcode: '222',
        sku: null,
        salePriceCents: 200,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'p-slot-1',
          locationId: 'loc-qk',
          stockQuantity: '10.0000',
          minimumStock: '0.0000',
          isAvailable: true,
          quickSlot: 1,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
      {
        id: 'p-slot-inactive',
        tenantId: 'tenant-qk',
        categoryId: null,
        name: 'Producto Inactivo Slot 2',
        normalizedName: 'producto inactivo slot 2',
        barcode: '333',
        sku: null,
        salePriceCents: 300,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        locationSettings: {
          productId: 'p-slot-inactive',
          locationId: 'loc-qk',
          stockQuantity: '10.0000',
          minimumStock: '0.0000',
          isAvailable: true,
          quickSlot: 2,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    ]);

    const quick = await db.getCachedQuickProducts('tenant-qk', 'loc-qk');
    expect(quick).toHaveLength(2);
    expect(quick[0]?.quickSlot).toBe(1);
    expect(quick[0]?.name).toBe('Producto Slot 1');
    expect(quick[1]?.quickSlot).toBe(3);
    expect(quick[1]?.name).toBe('Producto Slot 3');
  });

  describe('Dexie v5: Offline Sales Queue & Stock Sync', () => {
    it('enqueues sales with tenant, location, deviceId and defaults retryCount to 0', async () => {
      const sale: CreateSaleCommand = {
        shiftId: 'shift-1',
        idempotencyKey: 'offline-sale-1',
        items: [
          {
            productId: 'p-off-1',
            name: 'Producto Offline',
            quantity: 2,
            unitPriceCents: 500,
            totalPriceCents: 1000,
          },
        ],
        tenders: [
          { type: 'CASH', amountCents: 1000, receivedAmountCents: 1000, changeAmountCents: 0 },
        ],
        totalCents: 1000,
        createdAtUtc: new Date().toISOString(),
      };

      await db.enqueueSale(sale, {
        tenantId: 'tenant-v5',
        locationId: 'loc-v5',
        deviceId: 'pos-device-1',
      });

      const pending = await db.getPendingSalesForLocation('tenant-v5', 'loc-v5');
      expect(pending).toHaveLength(1);
      expect(pending[0]?.tenantId).toBe('tenant-v5');
      expect(pending[0]?.locationId).toBe('loc-v5');
      expect(pending[0]?.deviceId).toBe('pos-device-1');
      expect(pending[0]?.retryCount).toBe(0);
      expect(pending[0]?.status).toBe('PENDING');

      // Another location receives 0
      const otherPending = await db.getPendingSalesForLocation('tenant-v5', 'loc-other');
      expect(otherPending).toHaveLength(0);
    });

    it('decrements local cached product stock when an offline sale is enqueued without double-decrementing on sync', async () => {
      await db.cacheProducts('tenant-v5', 'loc-v5', [
        {
          id: 'prod-stock-1',
          tenantId: 'tenant-v5',
          categoryId: null,
          name: 'Alfajor Glaseado',
          normalizedName: 'alfajor glaseado',
          barcode: '123456',
          sku: 'ALF-GL',
          salePriceCents: 1000,
          costPriceCents: 500,
          unit: 'UNIT',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          locationSettings: {
            productId: 'prod-stock-1',
            locationId: 'loc-v5',
            stockQuantity: '10.0000',
            minimumStock: '2.0000',
            quickSlot: null,
            isAvailable: true,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ]);

      // Stock before sale
      let cached = await db.getCachedProducts('tenant-v5', 'loc-v5');
      expect(cached[0]?.stockQuantity).toBe('10.0000');

      // Enqueue offline sale of 3 units
      const sale: CreateSaleCommand = {
        shiftId: 'shift-1',
        idempotencyKey: 'offline-sale-2',
        items: [
          {
            productId: 'prod-stock-1',
            name: 'Alfajor Glaseado',
            quantity: 3,
            unitPriceCents: 1000,
            totalPriceCents: 3000,
          },
        ],
        tenders: [
          { type: 'CASH', amountCents: 3000, receivedAmountCents: 3000, changeAmountCents: 0 },
        ],
        totalCents: 3000,
        createdAtUtc: new Date().toISOString(),
      };

      await db.enqueueSaleWithStockDeduction(sale, {
        tenantId: 'tenant-v5',
        locationId: 'loc-v5',
        deviceId: 'pos-1',
      });

      // Stock immediately decremented locally to 7.0000
      cached = await db.getCachedProducts('tenant-v5', 'loc-v5');
      expect(cached[0]?.stockQuantity).toBe('7.0000');

      // Mark synced does NOT decrement stock again
      await db.markSynced({ tenantId: 'tenant-v5', locationId: 'loc-v5' }, 'offline-sale-2');
      cached = await db.getCachedProducts('tenant-v5', 'loc-v5');
      expect(cached[0]?.stockQuantity).toBe('7.0000');
    });

    it('updates sync status and increments retry count with last error', async () => {
      const sale: CreateSaleCommand = {
        shiftId: 'shift-1',
        idempotencyKey: 'offline-sale-3',
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
      };

      await db.enqueueSale(sale, {
        tenantId: 't1',
        locationId: 'l1',
      });

      await db.incrementRetry(
        { tenantId: 't1', locationId: 'l1' },
        'offline-sale-3',
        'Connection timeout'
      );
      const pending = await db.getPendingSalesForLocation('t1', 'l1');
      expect(pending[0]?.retryCount).toBe(1);
      expect(pending[0]?.lastError).toBe('Connection timeout');

      await db.updateSyncStatus(
        { tenantId: 't1', locationId: 'l1' },
        'offline-sale-3',
        'FAILED',
        'Fatal schema error'
      );
      const all = await db.syncQueue.toArray();
      const rec = all.find((r) => r.operationId === 'offline-sale-3');
      expect(rec?.status).toBe('FAILED');
      expect(rec?.lastError).toBe('Fatal schema error');
    });

    it('isolates operations across tenants using composite primary key [tenantId+locationId+operationId]', async () => {
      const sharedOperationId = 'shared-op-uuid-1234';
      const saleA: CreateSaleCommand = {
        idempotencyKey: sharedOperationId,
        items: [
          {
            productId: 'pA',
            name: 'Item A',
            quantity: 1,
            unitPriceCents: 100,
            totalPriceCents: 100,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100 }],
        totalCents: 100,
        createdAtUtc: new Date().toISOString(),
      };
      const saleB: CreateSaleCommand = {
        idempotencyKey: sharedOperationId,
        items: [
          {
            productId: 'pB',
            name: 'Item B',
            quantity: 2,
            unitPriceCents: 200,
            totalPriceCents: 400,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 400 }],
        totalCents: 400,
        createdAtUtc: new Date().toISOString(),
      };

      // Enqueue identical operationId in two different tenants
      await db.enqueueSale(saleA, { tenantId: 'tenant-alpha', locationId: 'loc-1' });
      await db.enqueueSale(saleB, { tenantId: 'tenant-beta', locationId: 'loc-2' });

      // No primary key collision: both records exist independently
      const pendingAlpha = await db.getPendingSalesForLocation('tenant-alpha', 'loc-1');
      const pendingBeta = await db.getPendingSalesForLocation('tenant-beta', 'loc-2');

      expect(pendingAlpha).toHaveLength(1);
      expect(pendingAlpha[0]?.payload.totalCents).toBe(100);
      expect(pendingBeta).toHaveLength(1);
      expect(pendingBeta[0]?.payload.totalCents).toBe(400);

      // Scoped pending counts without cross-tenant leakage
      expect(await db.getPendingCount('tenant-alpha', 'loc-1')).toBe(1);
      expect(await db.getPendingCount('tenant-beta', 'loc-2')).toBe(1);
      expect(await db.getPendingCount('tenant-other', 'loc-x')).toBe(0);

      // Updating status for tenant-alpha does not affect tenant-beta
      await db.markSynced({ tenantId: 'tenant-alpha', locationId: 'loc-1' }, sharedOperationId);
      expect(await db.getPendingCount('tenant-alpha', 'loc-1')).toBe(0);
      expect(await db.getPendingCount('tenant-beta', 'loc-2')).toBe(1);
    });

    it('strictly requires context with tenantId and locationId, rejecting undefined context', async () => {
      const sale: CreateSaleCommand = {
        idempotencyKey: 'op-no-context',
        items: [
          { productId: 'p1', name: 'Item', quantity: 1, unitPriceCents: 100, totalPriceCents: 100 },
        ],
        tenders: [{ type: 'CASH', amountCents: 100 }],
        totalCents: 100,
        createdAtUtc: new Date().toISOString(),
      };

      // @ts-expect-error missing context
      await expect(db.enqueueSale(sale)).rejects.toThrow(
        /El contexto con tenantId y locationId es obligatorio/
      );
      // @ts-expect-error missing context
      await expect(db.enqueueSale(sale, {})).rejects.toThrow(
        /El contexto con tenantId y locationId es obligatorio/
      );
      // @ts-expect-error missing context
      await expect(db.enqueueSaleWithStockDeduction(sale)).rejects.toThrow(
        /El contexto con tenantId y locationId es obligatorio/
      );
    });
  });

  describe('Offline Stock Reconciliation & Compensation', () => {
    it('reconciles local stock when an offline sale fails permanently, and ensures compensation is idempotent', async () => {
      // 1. Setup cached product with stock 10
      await db.cacheProducts('tenant-1', 'loc-1', [
        {
          id: 'prod-rec-1',
          tenantId: 'tenant-1',
          categoryId: null,
          name: 'Alfajor',
          normalizedName: 'alfajor',
          barcode: '779001',
          sku: 'ALF-1',
          salePriceCents: 1000,
          costPriceCents: null,
          unit: 'UNIT',
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          locationSettings: {
            productId: 'prod-rec-1',
            locationId: 'loc-1',
            stockQuantity: '10.0000',
            minimumStock: '2.0000',
            isAvailable: true,
            quickSlot: null,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      ]);

      // 2. Enqueue sale with stock deduction (quantity 2)
      const sale: CreateSaleCommand = {
        idempotencyKey: 'op-rec-1',
        items: [
          {
            productId: 'prod-rec-1',
            name: 'Alfajor',
            quantity: 2,
            unitPriceCents: 1000,
            totalPriceCents: 2000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 2000 }],
        totalCents: 2000,
        createdAtUtc: new Date().toISOString(),
      };

      await db.enqueueSaleWithStockDeduction(sale, { tenantId: 'tenant-1', locationId: 'loc-1' });

      // Local stock deducted to 8
      let cached = await db.getCachedProduct('tenant-1', 'loc-1', 'prod-rec-1');
      expect(parseFloat(cached!.stockQuantity)).toBe(8);

      // 3. Mark failed with compensation (server rejected permanently)
      await db.markFailedWithCompensation(
        { tenantId: 'tenant-1', locationId: 'loc-1' },
        'op-rec-1',
        'Producto deshabilitado en el servidor'
      );

      // Local stock compensated back to 10
      cached = await db.getCachedProduct('tenant-1', 'loc-1', 'prod-rec-1');
      expect(parseFloat(cached!.stockQuantity)).toBe(10);

      // Record is FAILED and marked stockCompensated
      const pendingList = await db.getPendingSalesForLocation('tenant-1', 'loc-1');
      const rec = pendingList.find((p) => p.operationId === 'op-rec-1');
      expect(rec?.status).toBe('FAILED');
      expect(rec?.stockCompensated).toBe(true);
      expect(rec?.lastError).toBe('Producto deshabilitado en el servidor');

      // 4. Repeated call to markFailedWithCompensation is idempotent (does not add stock again)
      await db.markFailedWithCompensation(
        { tenantId: 'tenant-1', locationId: 'loc-1' },
        'op-rec-1',
        'Producto deshabilitado en el servidor'
      );

      cached = await db.getCachedProduct('tenant-1', 'loc-1', 'prod-rec-1');
      expect(parseFloat(cached!.stockQuantity)).toBe(10); // Still 10, not 12!

      // 5. Subsequent retry re-deducts local stock
      await db.retryFailedOperation({ tenantId: 'tenant-1', locationId: 'loc-1' }, 'op-rec-1');
      cached = await db.getCachedProduct('tenant-1', 'loc-1', 'prod-rec-1');
      expect(parseFloat(cached!.stockQuantity)).toBe(8); // Re-deducted to 8

      const retriedList = await db.getPendingSalesForLocation('tenant-1', 'loc-1');
      const retriedRec = retriedList.find((p) => p.operationId === 'op-rec-1');
      expect(retriedRec?.status).toBe('PENDING');
      expect(retriedRec?.stockCompensated).toBe(false);

      // 6. Accepted sync leaves stock deducted
      await db.markSynced({ tenantId: 'tenant-1', locationId: 'loc-1' }, 'op-rec-1');
      cached = await db.getCachedProduct('tenant-1', 'loc-1', 'prod-rec-1');
      expect(parseFloat(cached!.stockQuantity)).toBe(8);
    });
  });

  describe('Dexie Real Migration & Safe Legacy Queue Quarantine', () => {
    const mockLegacySale: CreateSaleCommand = {
      shiftId: 'shift-legacy',
      idempotencyKey: 'legacy-op-001',
      items: [
        {
          productId: 'prod-legacy-1',
          name: 'Alfajor Legacy',
          quantity: 1,
          unitPriceCents: 150000,
          totalPriceCents: 150000,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 150000 }],
      totalCents: 150000,
      createdAtUtc: '2026-08-01T12:00:00.000Z',
    };

    it('1-5. Migrates legacy v4 database with unassigned operation into quarantine without deleting or attributing to arbitrary tenant', async () => {
      const dbName = `test-legacy-v4-${Date.now()}-${Math.random()}`;

      // 1. Create base v4 database with operation lacking tenantId and locationId
      const v4Db = new Dexie(dbName);
      v4Db.version(4).stores({
        syncQueue: 'operationId, type, status, createdAt',
      });
      await v4Db.open();
      await v4Db.table('syncQueue').put({
        operationId: 'legacy-op-001',
        type: 'CREATE_SALE',
        payload: mockLegacySale,
        createdAt: '2026-08-01T12:00:00.000Z',
        status: 'PENDING',
      });
      v4Db.close();

      // 2. Upgrade to current database version
      const upgradedDb = new PulsoOfflineDatabase(dbName);
      await upgradedDb.open();

      // 3. The operation did NOT disappear
      const allRecords = await upgradedDb.syncQueue.toArray();
      expect(allRecords).toHaveLength(1);
      const migrated = allRecords[0]!;
      expect(migrated.operationId).toBe('legacy-op-001');

      // 4. Does NOT appear inside an arbitrary active tenant or arbitrary branch
      const arbitraryTenantSales = await upgradedDb.getPendingSalesForLocation(
        'tenant-random',
        'loc-random'
      );
      expect(arbitraryTenantSales).toHaveLength(0);

      const defaultTenantSales = await upgradedDb.getPendingSalesForLocation(
        'default-tenant',
        'default-location'
      );
      expect(defaultTenantSales).toHaveLength(0);

      // 5. It is explicitly placed in quarantine state pending recovery
      expect(migrated.status).toBe('QUARANTINE');
      expect(migrated.legacyUnassigned).toBe(true);
      expect(migrated.tenantId).toBe(QUARANTINE_TENANT_ID);
      expect(migrated.locationId).toBe(QUARANTINE_LOCATION_ID);

      const quarantinedCount = await upgradedDb.getQuarantinedCount();
      expect(quarantinedCount).toBe(1);

      const quarantinedList = await upgradedDb.getQuarantinedRecords();
      expect(quarantinedList).toHaveLength(1);
      expect(quarantinedList[0]!.operationId).toBe('legacy-op-001');

      upgradedDb.close();
    });

    it('6. Performs unequivocal recovery when cache contains exactly one tenant and branch', async () => {
      const dbName = `test-unequivocal-${Date.now()}-${Math.random()}`;

      // Create v4 db with unassigned operation
      const v4Db = new Dexie(dbName);
      v4Db.version(4).stores({
        syncQueue: 'operationId, type, status, createdAt',
      });
      await v4Db.open();
      await v4Db.table('syncQueue').put({
        operationId: 'legacy-op-002',
        type: 'CREATE_SALE',
        payload: mockLegacySale,
        createdAt: '2026-08-01T12:00:00.000Z',
        status: 'PENDING',
      });
      v4Db.close();

      const db = new PulsoOfflineDatabase(dbName);
      await db.open();

      // Populate cachedProducts for exactly one single tenant and branch
      await db.cachedProducts.put({
        id: 'prod-legacy-1',
        tenantId: 'tenant-single',
        locationId: 'loc-single',
        categoryId: null,
        categoryName: null,
        name: 'Alfajor Legacy',
        normalizedName: 'alfajor legacy',
        barcode: null,
        sku: null,
        salePriceCents: 150000,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        isAvailable: true,
        stockQuantity: '10.0000',
        minimumStock: '1.0000',
        quickSlot: null,
        cachedAt: new Date().toISOString(),
      });

      expect(await db.getQuarantinedCount()).toBe(1);

      // Automatic recovery without explicit context
      const result = await db.recoverQuarantinedRecords();
      expect(result.blocked).toBe(false);
      expect(result.recovered).toBe(1);
      expect(result.ambiguous).toBe(0);

      // Quarantined count is now 0
      expect(await db.getQuarantinedCount()).toBe(0);

      // Now appears as PENDING in tenant-single / loc-single
      const pending = await db.getPendingSalesForLocation('tenant-single', 'loc-single');
      expect(pending).toHaveLength(1);
      expect(pending[0]!.status).toBe('PENDING');
      expect(pending[0]!.tenantId).toBe('tenant-single');
      expect(pending[0]!.locationId).toBe('loc-single');

      db.close();
    });

    it('7. Blocks automatic recovery when multiple tenants exist in cache (ambiguous case)', async () => {
      const dbName = `test-ambiguous-${Date.now()}-${Math.random()}`;

      // Create v4 db with unassigned operation
      const v4Db = new Dexie(dbName);
      v4Db.version(4).stores({
        syncQueue: 'operationId, type, status, createdAt',
      });
      await v4Db.open();
      await v4Db.table('syncQueue').put({
        operationId: 'legacy-op-003',
        type: 'CREATE_SALE',
        payload: mockLegacySale,
        createdAt: '2026-08-01T12:00:00.000Z',
        status: 'PENDING',
      });
      v4Db.close();

      const db = new PulsoOfflineDatabase(dbName);
      await db.open();

      // Populate cachedProducts for TWO different tenants (ambiguous)
      await db.cachedProducts.bulkPut([
        {
          id: 'prod-1',
          tenantId: 'tenant-alpha',
          locationId: 'loc-alpha',
          categoryId: null,
          categoryName: null,
          name: 'P1',
          normalizedName: 'p1',
          barcode: null,
          sku: null,
          salePriceCents: 1000,
          costPriceCents: null,
          unit: 'UNIT',
          isActive: true,
          isAvailable: true,
          stockQuantity: '5.0000',
          minimumStock: '1.0000',
          quickSlot: null,
          cachedAt: new Date().toISOString(),
        },
        {
          id: 'prod-2',
          tenantId: 'tenant-beta',
          locationId: 'loc-beta',
          categoryId: null,
          categoryName: null,
          name: 'P2',
          normalizedName: 'p2',
          barcode: null,
          sku: null,
          salePriceCents: 2000,
          costPriceCents: null,
          unit: 'UNIT',
          isActive: true,
          isAvailable: true,
          stockQuantity: '5.0000',
          minimumStock: '1.0000',
          quickSlot: null,
          cachedAt: new Date().toISOString(),
        },
      ]);

      expect(await db.getQuarantinedCount()).toBe(1);

      // Automatic recovery must be blocked due to ambiguity
      const autoResult = await db.recoverQuarantinedRecords();
      expect(autoResult.blocked).toBe(true);
      expect(autoResult.recovered).toBe(0);
      expect(autoResult.ambiguous).toBe(1);

      // Record remains in quarantine
      expect(await db.getQuarantinedCount()).toBe(1);

      // Explicit recovery by admin resolves the ambiguity safely
      const explicitResult = await db.recoverQuarantinedRecords({
        tenantId: 'tenant-alpha',
        locationId: 'loc-alpha',
      });
      expect(explicitResult.blocked).toBe(false);
      expect(explicitResult.recovered).toBe(1);
      expect(await db.getQuarantinedCount()).toBe(0);

      db.close();
    });

    it('8. Recovery is strictly idempotent (running twice does not duplicate or re-sync)', async () => {
      const dbName = `test-idempotent-${Date.now()}-${Math.random()}`;

      const v4Db = new Dexie(dbName);
      v4Db.version(4).stores({
        syncQueue: 'operationId, type, status, createdAt',
      });
      await v4Db.open();
      await v4Db.table('syncQueue').put({
        operationId: 'legacy-op-004',
        type: 'CREATE_SALE',
        payload: mockLegacySale,
        createdAt: '2026-08-01T12:00:00.000Z',
        status: 'PENDING',
      });
      v4Db.close();

      const db = new PulsoOfflineDatabase(dbName);
      await db.open();

      // Run 1 of explicit recovery
      const res1 = await db.recoverQuarantinedRecords({
        tenantId: 'tenant-target',
        locationId: 'loc-target',
      });
      expect(res1.recovered).toBe(1);

      // Run 2 of recovery
      const res2 = await db.recoverQuarantinedRecords({
        tenantId: 'tenant-target',
        locationId: 'loc-target',
      });
      expect(res2.recovered).toBe(0);
      expect(res2.blocked).toBe(false);

      // Total records in queue is still exactly 1 (no duplicates)
      const allQueue = await db.syncQueue.toArray();
      expect(allQueue).toHaveLength(1);
      expect(await db.getPendingCount('tenant-target', 'loc-target')).toBe(1);

      db.close();
    });

    it('9. Modern operations continue functioning normally alongside quarantine/recovery', async () => {
      const dbName = `test-modern-${Date.now()}-${Math.random()}`;
      const db = new PulsoOfflineDatabase(dbName);
      await db.open();

      const modernSale: CreateSaleCommand = {
        shiftId: 'shift-modern',
        idempotencyKey: 'modern-op-001',
        items: [
          {
            productId: 'prod-mod-1',
            name: 'Gaseosa',
            quantity: 2,
            unitPriceCents: 200000,
            totalPriceCents: 400000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 400000 }],
        totalCents: 400000,
        createdAtUtc: new Date().toISOString(),
      };

      await db.cachedProducts.put({
        id: 'prod-mod-1',
        tenantId: 'tenant-mod',
        locationId: 'loc-mod',
        categoryId: null,
        categoryName: null,
        name: 'Gaseosa',
        normalizedName: 'gaseosa',
        barcode: null,
        sku: null,
        salePriceCents: 200000,
        costPriceCents: null,
        unit: 'UNIT',
        isActive: true,
        isAvailable: true,
        stockQuantity: '20.0000',
        minimumStock: '2.0000',
        quickSlot: null,
        cachedAt: new Date().toISOString(),
      });

      await db.enqueueSaleWithStockDeduction(modernSale, {
        tenantId: 'tenant-mod',
        locationId: 'loc-mod',
      });

      expect(await db.getPendingCount('tenant-mod', 'loc-mod')).toBe(1);
      const cached = await db.getCachedProduct('tenant-mod', 'loc-mod', 'prod-mod-1');
      expect(parseFloat(cached!.stockQuantity)).toBe(18);

      await db.markSynced({ tenantId: 'tenant-mod', locationId: 'loc-mod' }, 'modern-op-001');
      expect(await db.getPendingCount('tenant-mod', 'loc-mod')).toBe(0);

      db.close();
    });
  });
});
