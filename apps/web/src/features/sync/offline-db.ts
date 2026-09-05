import { Dexie, type Table } from 'dexie';
import type { CreateSaleCommand, ProductResponse } from '@pulso/contracts';

export interface PendingSyncRecord {
  operationId: string;
  type: 'CREATE_SALE' | 'CASH_MOVEMENT';
  payload: CreateSaleCommand;
  createdAt: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
}

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
  syncQueue!: Table<PendingSyncRecord, string>;
  cachedProducts!: Table<CachedProductRecord, [string, string, string]>;

  constructor() {
    super('PulsoOfflineDB');

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
  }

  // --- Sales Queue ---

  async enqueueSale(sale: CreateSaleCommand): Promise<void> {
    await this.syncQueue.put({
      operationId: sale.idempotencyKey,
      type: 'CREATE_SALE',
      payload: sale,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
    });
  }

  async getPendingCount(): Promise<number> {
    return await this.syncQueue.where('status').equals('PENDING').count();
  }

  async getAllPending(): Promise<PendingSyncRecord[]> {
    return await this.syncQueue.where('status').equals('PENDING').toArray();
  }

  async markSynced(operationId: string): Promise<void> {
    await this.syncQueue.update(operationId, { status: 'SYNCED' });
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
