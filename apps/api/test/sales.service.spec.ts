import { describe, it, expect, beforeEach } from 'vitest';
import { SalesService } from '../src/sales/sales.service.js';
import { BadRequestException } from '@nestjs/common';

describe('SalesService in-memory idempotent ledger', () => {
  let service: SalesService;
  const validSession = {
    tenantId: 'tenant-verified-123',
    locationId: 'loc-verified-456',
  };

  beforeEach(() => {
    service = new SalesService();
  });

  it('processes a new valid sale with verified session context', async () => {
    const command = {
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

    const res = await service.processSale(command, validSession);
    expect(res.success).toBe(true);
    expect(res.idempotentReplay).toBe(false);
    expect(res.sale.saleId).toMatch(/^SALE-/);
    expect(res.sale.totalCents).toBe(120000);
    expect(res.sale.tenantId).toBe('tenant-verified-123');
    expect(res.sale.locationId).toBe('loc-verified-456');
  });

  it('returns idempotent replay when receiving same idempotency key within tenant', async () => {
    const command = {
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
    const firstRes = await service.processSale(command, validSession);
    expect(firstRes.idempotentReplay).toBe(false);

    // Replay call
    const secondRes = await service.processSale(command, validSession);
    expect(secondRes.idempotentReplay).toBe(true);
    expect(secondRes.sale.saleId).toBe(firstRes.sale.saleId);
  });

  it('strictly rejects sale processing when session context is missing or incomplete', async () => {
    const validCommand = {
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

    // @ts-expect-error testing missing session context
    await expect(service.processSale(validCommand, undefined)).rejects.toThrow(BadRequestException);

    // @ts-expect-error testing incomplete session context
    await expect(service.processSale(validCommand, { tenantId: 't1' })).rejects.toThrow(
      BadRequestException
    );
  });

  it('rejects sale payloads attempting client injection of tenantId or locationId', async () => {
    const injectedCommand = {
      tenantId: 'attacker-injected-tenant',
      locationId: 'attacker-injected-location',
      shiftId: 'shift-1',
      idempotencyKey: 'e5a07384-d113-4638-b4ea-4c91a0c8b444',
      items: [
        {
          productId: 'prod-3',
          name: 'Chocolate',
          quantity: 1,
          unitPriceCents: 200000,
          totalPriceCents: 200000,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 200000 }],
      totalCents: 200000,
      createdAtUtc: new Date().toISOString(),
    };

    await expect(service.processSale(injectedCommand, validSession)).rejects.toThrow(
      BadRequestException
    );
  });
});
