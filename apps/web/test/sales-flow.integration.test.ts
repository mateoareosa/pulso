import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSalesStore } from '../src/features/sales/store/sales.store';
import { offlineDb } from '../src/features/sync/offline-db';
import { salesApi } from '../src/features/sales/services/sales-api';
import 'fake-indexeddb/auto'; // Mock indexedDB in Node/jsdom

describe('E2E Simulated Sales Flow with Offline Resilience', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    useSalesStore.getState().clearCart();
    useSalesStore.getState().dismissSuccess();
    useSalesStore.getState().setConnectionStatus('online');
    await offlineDb.clearAll();
  });

  it('completes end-to-end sales lifecycle: add items -> go offline -> tender cash -> enqueue -> sync on reconnect', async () => {
    const store = useSalesStore.getState();

    // 1. Add products to active sale
    store.addItem({
      productId: 'prod-01',
      name: 'Alfajor Triple',
      barcode: '779001',
      unitPriceCents: 120000, // $1.200,00
    });
    store.addItem({
      productId: 'prod-02',
      name: 'Gaseosa Cola 500ml',
      barcode: '779002',
      unitPriceCents: 150000, // $1.500,00
    });

    // Total should be $2.700,00 (270000 cents)
    const currentItems = useSalesStore.getState().items;
    const totalCents = currentItems.reduce((acc, it) => acc + it.totalPriceCents, 0);
    expect(totalCents).toBe(270000);
    expect(currentItems.length).toBe(2);

    // 2. Internet connection drops (simulate offline)
    useSalesStore.getState().setConnectionStatus('offline');
    expect(useSalesStore.getState().connectionStatus).toBe('offline');

    // 3. Open Tender & Pay Cash
    useSalesStore.getState().openTender();
    expect(useSalesStore.getState().isTenderOpen).toBe(true);

    // Customer pays with $5.000 ($5000.00 -> 500000 cents)
    const receivedCents = 500000;
    const changeCents = 230000; // $2.300,00 change

    await useSalesStore.getState().processCashPayment(receivedCents, changeCents, {
      tenantId: 'tenant-1',
      locationId: 'loc-1',
    });

    // 4. Cart cleared and Success Seal rendered with offline indicator
    const stateAfterSale = useSalesStore.getState();
    expect(stateAfterSale.items.length).toBe(0);
    expect(stateAfterSale.lastSaleSuccess).toBeDefined();
    expect(stateAfterSale.lastSaleSuccess?.isOffline).toBe(true);
    expect(stateAfterSale.lastSaleSuccess?.changeFormatted).toMatch(/\$|2\.300,00/);

    // 5. Verify sale is persisted in local offline queue
    const pendingInDb = await offlineDb.getAllPending();
    expect(pendingInDb.length).toBe(1);
    expect(pendingInDb[0]!.type).toBe('CREATE_SALE');
    expect(pendingInDb[0]!.payload.totalCents).toBe(270000);
    expect(pendingInDb[0]!.payload.idempotencyKey).toBe(
      stateAfterSale.lastSaleSuccess?.idempotencyKey
    );

    // Ribbon shows 1 pending sync
    expect(useSalesStore.getState().pendingSyncCount).toBe(1);

    // 6. Connectivity restored and synchronization triggered
    vi.spyOn(salesApi, 'syncBatch').mockImplementation(async (batch) => ({
      syncedCount: batch.operations.length,
      results: batch.operations.map((op: { operationId: string }) => ({
        operationId: op.operationId,
        status: 'SYNCED',
        idempotentReplay: false,
        saleId: `synced-${op.operationId}`,
        tenantId: 'tenant-1',
        locationId: 'loc-1',
      })),
    }));
    await useSalesStore.getState().syncPendingSales({ tenantId: 'tenant-1', locationId: 'loc-1' });

    // 7. Verify sync completion: queue is clear, connection back to online
    const finalPending = await offlineDb.getPendingCount('tenant-1', 'loc-1');
    expect(finalPending).toBe(0);
    expect(useSalesStore.getState().connectionStatus).toBe('online');
    expect(useSalesStore.getState().pendingSyncCount).toBe(0);
  });
});
