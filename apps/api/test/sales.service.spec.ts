import { describe, it, expect, beforeEach } from 'vitest';
import { SalesService } from '../src/sales/sales.service.js';

describe('SalesService in-memory idempotent ledger', () => {
  let service: SalesService;

  beforeEach(() => {
    service = new SalesService();
  });

  it('processes a new valid sale', async () => {
    const command = {
      tenantId: 'tenant-test',
      locationId: 'loc-test',
      shiftId: 'shift-1',
      idempotencyKey: 'd3b07384-d113-4638-b4ea-4c91a0c8b211',
      items: [
        {
          productId: 'prod-1',
          name: 'Alfajor',
          quantity: 1,
          unitPriceCents: 120000,
          totalPriceCents: 120000,
        },
      ],
      tenders: [
        {
          type: 'CASH',
          amountCents: 120000,
        },
      ],
      totalCents: 120000,
      createdAtUtc: new Date().toISOString(),
    };

    const res = await service.processSale(command);
    expect(res.success).toBe(true);
    expect(res.idempotentReplay).toBe(false);
    expect(res.sale.saleId).toMatch(/^SALE-/);
    expect(res.sale.totalCents).toBe(120000);
  });

  it('returns idempotent replay when receiving same idempotency key', async () => {
    const command = {
      tenantId: 'tenant-test',
      locationId: 'loc-test',
      shiftId: 'shift-1',
      idempotencyKey: 'c2a07384-d113-4638-b4ea-4c91a0c8b333',
      items: [
        {
          productId: 'prod-2',
          name: 'Gaseosa',
          quantity: 1,
          unitPriceCents: 150000,
          totalPriceCents: 150000,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 150000 }],
      totalCents: 150000,
      createdAtUtc: new Date().toISOString(),
    };

    // First call
    const firstRes = await service.processSale(command);
    expect(firstRes.idempotentReplay).toBe(false);

    // Replay call
    const secondRes = await service.processSale(command);
    expect(secondRes.idempotentReplay).toBe(true);
    expect(secondRes.sale.saleId).toBe(firstRes.sale.saleId);
  });

  it('rejects invalid payload without tenantId', async () => {
    const invalidCommand = {
      locationId: 'loc-test',
      idempotencyKey: 'c2a07384-d113-4638-b4ea-4c91a0c8b333',
    };

    await expect(service.processSale(invalidCommand)).rejects.toThrow();
  });
});
