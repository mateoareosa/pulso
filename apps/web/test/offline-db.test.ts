import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { PulsoOfflineDatabase } from '../src/features/sync/offline-db';
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

    await db.enqueueSale(sale);
    expect(await db.getPendingCount()).toBe(1);

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
    await db.enqueueSale(sale);
    expect(await db.getPendingCount()).toBe(1);

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
    await db.enqueueSale(pendingSale);

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
});
