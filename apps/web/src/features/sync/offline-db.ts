import { Dexie, type Table } from 'dexie';
import type { CreateSaleCommand } from '@pulso/contracts';

export interface PendingSyncRecord {
  operationId: string;
  type: 'CREATE_SALE' | 'CASH_MOVEMENT';
  payload: CreateSaleCommand;
  createdAt: string;
  status: 'PENDING' | 'SYNCED' | 'FAILED';
}

export class PulsoOfflineDatabase extends Dexie {
  syncQueue!: Table<PendingSyncRecord, string>;

  constructor() {
    super('PulsoOfflineDB');
    this.version(1).stores({
      syncQueue: 'operationId, type, status, createdAt',
    });
  }

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
}

export const offlineDb = new PulsoOfflineDatabase();
