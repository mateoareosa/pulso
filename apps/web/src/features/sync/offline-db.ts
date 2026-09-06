import { Dexie, type Table } from 'dexie';
import type { CreateSaleCommand, ProductResponse } from '@pulso/contracts';

export interface PendingSyncRecord {
  operationId: string;
  type: 'CREATE_SALE' | 'CASH_MOVEMENT';
  payload: CreateSaleCommand;
  tenantId: string;
  locationId: string;
  deviceId: string;
  retryCount: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt?: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED' | 'QUARANTINE';
  stockCompensated?: boolean;
  legacyUnassigned?: boolean;
}

export const QUARANTINE_TENANT_ID = '__LEGACY_QUARANTINE__';
export const QUARANTINE_LOCATION_ID = '__LEGACY_QUARANTINE__';

export interface CachedProductRecord {
  id: string;
  tenantId: string;
  locationId: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  normalizedName: string;
  barcode: string | null;
  sku: string | null;
  salePriceCents: number;
  costPriceCents: number | null;
  unit: string;
  isActive: boolean;
  isAvailable: boolean;
  stockQuantity: string;
  minimumStock: string;
  quickSlot: number | null;
  version?: number;
  cachedAt: string;
}

export function normalizeSearchText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export class PulsoOfflineDatabase extends Dexie {
  syncQueue!: Table<PendingSyncRecord, [string, string, string]>;
  cachedProducts!: Table<CachedProductRecord, [string, string, string]>;

  constructor(dbName = 'PulsoOfflineDB') {
    super(dbName);

    this.version(1).stores({
      syncQueue: 'operationId, type, status, createdAt',
    });

    this.version(2).stores({
      syncQueue: 'operationId, type, status, createdAt',
      cachedProducts:
        'id, [tenantId+locationId], barcode, normalizedName, quickSlot, isActive, isAvailable',
    });

    this.version(3).stores({
      syncQueue: 'operationId, type, status, createdAt',
      cachedProducts: null,
    });

    this.version(4).stores({
      syncQueue: 'operationId, type, status, createdAt',
      cachedProducts:
        '[tenantId+locationId+id], [tenantId+locationId], barcode, normalizedName, quickSlot, isActive, isAvailable',
    });

    this.version(5)
      .stores({
        syncQueue: 'operationId, [tenantId+locationId], status, createdAt, updatedAt',
        legacySyncQueue: 'operationId',
        cachedProducts:
          '[tenantId+locationId+id], [tenantId+locationId], barcode, normalizedName, quickSlot, isActive, isAvailable',
      })
      .upgrade(async (tx) => {
        const records = await tx.table('syncQueue').toArray();
        if (records.length > 0) {
          await tx.table('legacySyncQueue').bulkPut(records);
        }
      });

    this.version(6).stores({
      syncQueue: null,
      cachedProducts:
        '[tenantId+locationId+id], [tenantId+locationId], barcode, normalizedName, quickSlot, isActive, isAvailable',
    });

    this.version(7)
      .stores({
        syncQueue:
          '[tenantId+locationId+operationId], [tenantId+locationId], [tenantId+locationId+status], operationId, status, createdAt, updatedAt',
        legacySyncQueue: null,
        cachedProducts:
          '[tenantId+locationId+id], [tenantId+locationId], barcode, normalizedName, quickSlot, isActive, isAvailable',
      })
      .upgrade(async (tx) => {
        const legacyTable = tx.table('legacySyncQueue');
        const queueTable = tx.table('syncQueue');
        const legacyRecords = await legacyTable.toArray();
        for (const record of legacyRecords) {
          const isLegacy =
            !record.tenantId ||
            !record.locationId ||
            record.tenantId === 'default-tenant' ||
            record.tenantId === 'unassigned' ||
            record.tenantId === QUARANTINE_TENANT_ID ||
            record.locationId === 'default-location' ||
            record.locationId === 'unassigned' ||
            record.legacyUnassigned;

          const tenantId = isLegacy ? QUARANTINE_TENANT_ID : record.tenantId;
          const locationId = isLegacy ? QUARANTINE_LOCATION_ID : record.locationId;
          const status = isLegacy ? 'QUARANTINE' : record.status || 'PENDING';

          await queueTable.put({
            ...record,
            tenantId,
            locationId,
            status,
            legacyUnassigned: isLegacy,
            lastError: isLegacy
              ? 'Operación legacy pendiente de recuperación de contexto'
              : record.lastError,
            deviceId: record.deviceId || 'web-pos',
            retryCount: record.retryCount ?? 0,
            updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),
          });
        }
      });
  }

  // --- Sales Queue ---

  async enqueueSale(
    sale: CreateSaleCommand,
    context: { tenantId: string; locationId: string; deviceId?: string }
  ): Promise<void> {
    if (!context?.tenantId || !context?.locationId) {
      throw new Error(
        'El contexto con tenantId y locationId es obligatorio para encolar operaciones offline.'
      );
    }
    const now = sale.createdAtUtc || new Date().toISOString();
    await this.syncQueue.put({
      operationId: sale.idempotencyKey,
      type: 'CREATE_SALE',
      payload: sale,
      tenantId: context.tenantId,
      locationId: context.locationId,
      deviceId: context.deviceId ?? 'web-pos',
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
      status: 'PENDING',
    });
  }

  async enqueueSaleWithStockDeduction(
    sale: CreateSaleCommand,
    context: { tenantId: string; locationId: string; deviceId?: string }
  ): Promise<void> {
    if (!context?.tenantId || !context?.locationId) {
      throw new Error(
        'El contexto con tenantId y locationId es obligatorio para encolar operaciones offline.'
      );
    }
    const { tenantId, locationId } = context;

    await this.transaction('rw', this.syncQueue, this.cachedProducts, async () => {
      await this.enqueueSale(sale, context);

      // Deduct stock for items sold locally in Dexie
      for (const item of sale.items) {
        const cached = await this.cachedProducts.get([tenantId, locationId, item.productId]);
        if (cached) {
          const currentQty = parseFloat(cached.stockQuantity || '0');
          const resultingQty = (currentQty - item.quantity).toFixed(4);
          await this.cachedProducts.update([tenantId, locationId, item.productId], {
            stockQuantity: resultingQty,
          });
        }
      }
    });
  }

  async getPendingCount(tenantId: string, locationId: string): Promise<number> {
    if (!tenantId || !locationId) return 0;
    const records = await this.syncQueue
      .where('[tenantId+locationId]')
      .equals([tenantId, locationId])
      .toArray();
    return records.filter((r) => r.status === 'PENDING').length;
  }

  async getPendingSalesForLocation(
    tenantId: string,
    locationId: string
  ): Promise<PendingSyncRecord[]> {
    if (!tenantId || !locationId) return [];
    const records = await this.syncQueue
      .where('[tenantId+locationId]')
      .equals([tenantId, locationId])
      .toArray();
    return records.filter((r) => r.status === 'PENDING' || r.status === 'FAILED');
  }

  async getAllPending(): Promise<PendingSyncRecord[]> {
    return await this.syncQueue.where('status').equals('PENDING').toArray();
  }

  async getQuarantinedRecords(): Promise<PendingSyncRecord[]> {
    return await this.syncQueue.where('status').equals('QUARANTINE').toArray();
  }

  async getQuarantinedCount(): Promise<number> {
    return await this.syncQueue.where('status').equals('QUARANTINE').count();
  }

  async getCachedTenantLocations(): Promise<Array<{ tenantId: string; locationId: string }>> {
    const allCached = await this.cachedProducts.toArray();
    const seen = new Set<string>();
    const result: Array<{ tenantId: string; locationId: string }> = [];
    for (const p of allCached) {
      if (p.tenantId && p.locationId && p.tenantId !== QUARANTINE_TENANT_ID) {
        const key = `${p.tenantId}::${p.locationId}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push({ tenantId: p.tenantId, locationId: p.locationId });
        }
      }
    }
    return result;
  }

  async recoverQuarantinedRecords(explicitContext?: {
    tenantId: string;
    locationId: string;
  }): Promise<{ recovered: number; ambiguous: number; blocked: boolean; reason?: string }> {
    const quarantined = await this.getQuarantinedRecords();
    if (quarantined.length === 0) {
      return { recovered: 0, ambiguous: 0, blocked: false };
    }

    let target = explicitContext;

    if (!target) {
      // Attempt unequivocal automatic inference from cached catalog data
      const cachedPairs = await this.getCachedTenantLocations();
      if (cachedPairs.length === 1 && cachedPairs[0]) {
        target = cachedPairs[0];
      } else if (cachedPairs.length === 0) {
        return {
          recovered: 0,
          ambiguous: quarantined.length,
          blocked: true,
          reason: 'No hay información en caché para inferir tenant y sucursal de destino.',
        };
      } else {
        return {
          recovered: 0,
          ambiguous: quarantined.length,
          blocked: true,
          reason:
            'Existen múltiples comercios en caché; se requiere asignación explícita de administrador.',
        };
      }
    }

    if (!target || !target.tenantId || !target.locationId) {
      return {
        recovered: 0,
        ambiguous: quarantined.length,
        blocked: true,
        reason: 'El contexto de recuperación es incompleto o inválido.',
      };
    }

    const { tenantId, locationId } = target;

    await this.transaction('rw', this.syncQueue, async () => {
      for (const rec of quarantined) {
        await this.syncQueue.delete([rec.tenantId, rec.locationId, rec.operationId]);
        await this.syncQueue.put({
          ...rec,
          tenantId,
          locationId,
          status: 'PENDING',
          legacyUnassigned: false,
          lastError: null,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    return {
      recovered: quarantined.length,
      ambiguous: 0,
      blocked: false,
    };
  }

  async updateSyncStatus(
    context: { tenantId: string; locationId: string },
    operationId: string,
    status: 'PENDING' | 'SYNCED' | 'FAILED',
    error?: string | null
  ): Promise<void> {
    if (!context?.tenantId || !context?.locationId) {
      throw new Error('El contexto con tenantId y locationId es obligatorio.');
    }
    await this.syncQueue.update([context.tenantId, context.locationId, operationId], {
      status,
      lastError: error ?? null,
      updatedAt: new Date().toISOString(),
    });
  }

  async incrementRetry(
    context: { tenantId: string; locationId: string },
    operationId: string,
    error: string
  ): Promise<void> {
    if (!context?.tenantId || !context?.locationId) {
      throw new Error('El contexto con tenantId y locationId es obligatorio.');
    }
    const record = await this.syncQueue.get([context.tenantId, context.locationId, operationId]);
    if (record) {
      await this.syncQueue.update([context.tenantId, context.locationId, operationId], {
        status: 'FAILED',
        retryCount: (record.retryCount || 0) + 1,
        lastError: error,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  async markSynced(
    context: { tenantId: string; locationId: string },
    operationId: string
  ): Promise<void> {
    if (!context?.tenantId || !context?.locationId) {
      throw new Error('El contexto con tenantId y locationId es obligatorio.');
    }
    await this.syncQueue.update([context.tenantId, context.locationId, operationId], {
      status: 'SYNCED',
      updatedAt: new Date().toISOString(),
    });
  }

  async markFailedWithCompensation(
    context: { tenantId: string; locationId: string },
    operationId: string,
    error: string
  ): Promise<void> {
    if (!context?.tenantId || !context?.locationId) {
      throw new Error('El contexto con tenantId y locationId es obligatorio.');
    }
    const { tenantId, locationId } = context;
    await this.transaction('rw', this.syncQueue, this.cachedProducts, async () => {
      const record = await this.syncQueue.get([tenantId, locationId, operationId]);
      if (!record) return;

      // Compensate stock if not already compensated
      if (!record.stockCompensated && record.payload?.items) {
        for (const item of record.payload.items) {
          const cached = await this.cachedProducts.get([tenantId, locationId, item.productId]);
          if (cached) {
            const currentQty = parseFloat(cached.stockQuantity || '0');
            const compensatedQty = (currentQty + item.quantity).toFixed(4);
            await this.cachedProducts.update([tenantId, locationId, item.productId], {
              stockQuantity: compensatedQty,
            });
          }
        }
      }

      await this.syncQueue.update([tenantId, locationId, operationId], {
        status: 'FAILED',
        retryCount: (record.retryCount || 0) + 1,
        lastError: error,
        stockCompensated: true,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async retryFailedOperation(
    context: { tenantId: string; locationId: string },
    operationId: string
  ): Promise<void> {
    if (!context?.tenantId || !context?.locationId) {
      throw new Error('El contexto con tenantId y locationId es obligatorio.');
    }
    const { tenantId, locationId } = context;
    await this.transaction('rw', this.syncQueue, this.cachedProducts, async () => {
      const record = await this.syncQueue.get([tenantId, locationId, operationId]);
      if (!record || record.status !== 'FAILED') return;

      // Re-deduct local stock if it was previously compensated
      if (record.stockCompensated && record.payload?.items) {
        for (const item of record.payload.items) {
          const cached = await this.cachedProducts.get([tenantId, locationId, item.productId]);
          if (cached) {
            const currentQty = parseFloat(cached.stockQuantity || '0');
            const reDeductedQty = (currentQty - item.quantity).toFixed(4);
            await this.cachedProducts.update([tenantId, locationId, item.productId], {
              stockQuantity: reDeductedQty,
            });
          }
        }
      }

      await this.syncQueue.update([tenantId, locationId, operationId], {
        status: 'PENDING',
        stockCompensated: false,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  async getCachedProduct(
    tenantId: string,
    locationId: string,
    productId: string
  ): Promise<CachedProductRecord | undefined> {
    if (!tenantId || !locationId || !productId) return undefined;
    return await this.cachedProducts.get([tenantId, locationId, productId]);
  }

  async reconcileProducts(
    tenantId: string,
    locationId: string,
    products: Array<{ id: string; stockQuantity: string; isAvailable: boolean }>
  ): Promise<void> {
    if (!tenantId || !locationId) return;
    await this.transaction('rw', this.cachedProducts, async () => {
      for (const p of products) {
        const cached = await this.cachedProducts.get([tenantId, locationId, p.id]);
        if (cached) {
          await this.cachedProducts.update([tenantId, locationId, p.id], {
            stockQuantity: p.stockQuantity,
            isAvailable: p.isAvailable,
          });
        }
      }
    });
  }

  async clearAll(): Promise<void> {
    await this.syncQueue.clear();
  }

  private currentGeneration = 0;

  bumpGeneration(): number {
    return ++this.currentGeneration;
  }

  getGeneration(): number {
    return this.currentGeneration;
  }

  // --- Cached Catalog ---

  async cacheProducts(
    tenantId: string,
    locationId: string,
    products: ProductResponse[],
    options?: { append?: boolean; generation?: number }
  ): Promise<void> {
    if (options?.generation !== undefined && options.generation !== this.currentGeneration) {
      return;
    }

    const records: CachedProductRecord[] = products.map((p) => ({
      id: p.id,
      tenantId,
      locationId,
      categoryId: p.categoryId,
      categoryName: p.category?.name || null,
      name: p.name,
      normalizedName: p.normalizedName,
      barcode: p.barcode,
      sku: p.sku,
      salePriceCents: p.salePriceCents,
      costPriceCents: p.costPriceCents,
      unit: p.unit,
      isActive: p.isActive,
      isAvailable: p.locationSettings ? p.locationSettings.isAvailable : false,
      stockQuantity: p.locationSettings?.stockQuantity ?? '0.0000',
      minimumStock: p.locationSettings?.minimumStock ?? '0.0000',
      quickSlot: p.locationSettings?.quickSlot ?? null,
      version: p.locationSettings?.version ?? 1,
      cachedAt: new Date().toISOString(),
    }));

    await this.transaction('rw', this.cachedProducts, async () => {
      if (options?.generation !== undefined && options.generation !== this.currentGeneration) {
        return;
      }
      if (!options?.append) {
        await this.cachedProducts
          .where('[tenantId+locationId]')
          .equals([tenantId, locationId])
          .delete();
      }
      if (records.length > 0) {
        if (options?.generation !== undefined && options.generation !== this.currentGeneration) {
          return;
        }
        await this.cachedProducts.bulkPut(records);
      }
    });
  }

  async getCachedProducts(
    tenantId: string,
    locationId: string,
    options?: { onlyAvailable?: boolean; onlyActive?: boolean }
  ): Promise<CachedProductRecord[]> {
    const all = await this.cachedProducts
      .where('[tenantId+locationId]')
      .equals([tenantId, locationId])
      .toArray();

    return all.filter((p) => {
      if (options?.onlyActive !== false && !p.isActive) return false;
      if (options?.onlyAvailable !== false && !p.isAvailable) return false;
      return true;
    });
  }

  async searchCachedProducts(
    tenantId: string,
    locationId: string,
    query: string
  ): Promise<CachedProductRecord[]> {
    const products = await this.getCachedProducts(tenantId, locationId, {
      onlyActive: true,
      onlyAvailable: true,
    });

    const trimmed = query.trim();
    if (!trimmed) {
      return products;
    }

    const normalizedQ = normalizeSearchText(trimmed);

    const exactBarcodeMatches = products.filter((p) => p.barcode === trimmed);
    const otherMatches = products.filter((p) => {
      if (p.barcode === trimmed) return false;
      return (
        p.normalizedName.includes(normalizedQ) ||
        (p.barcode && p.barcode.includes(trimmed)) ||
        (p.sku && p.sku.toLowerCase().includes(trimmed.toLowerCase()))
      );
    });

    return [...exactBarcodeMatches, ...otherMatches];
  }

  async getCachedQuickProducts(
    tenantId: string,
    locationId: string
  ): Promise<CachedProductRecord[]> {
    const all = await this.cachedProducts
      .where('[tenantId+locationId]')
      .equals([tenantId, locationId])
      .toArray();

    return all
      .filter(
        (p) =>
          p.quickSlot !== null &&
          p.quickSlot !== undefined &&
          p.quickSlot >= 1 &&
          p.quickSlot <= 8 &&
          p.isActive &&
          p.isAvailable
      )
      .sort((a, b) => (a.quickSlot || 0) - (b.quickSlot || 0));
  }

  async clearCachedProductsForLocation(tenantId: string, locationId: string): Promise<void> {
    await this.cachedProducts
      .where('[tenantId+locationId]')
      .equals([tenantId, locationId])
      .delete();
  }

  async clearAllCachedProducts(): Promise<void> {
    await this.cachedProducts.clear();
  }

  async clearCachedCatalog(): Promise<void> {
    this.bumpGeneration();
    await this.cachedProducts.clear();
  }
}

export const offlineDb = new PulsoOfflineDatabase();
