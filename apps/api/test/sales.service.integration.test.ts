import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { SalesService } from '../src/sales/sales.service.js';
import { BadRequestException } from '@nestjs/common';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { SessionContext } from '../src/auth/cookie.utils.js';

describe('SalesService transactional sales processor', () => {
  let service: SalesService;
  let tenantId: string;
  let locationId: string;
  let userId: string;
  let productId: string;
  let validSession: SessionContext;

  beforeEach(async () => {
    await truncateAllTables();
    service = new SalesService(testPrisma as unknown as PrismaService);

    const tenant = await testPrisma.tenant.create({
      data: {
        name: 'Kiosco Test',
        slug: 'kiosco-test-' + Math.random().toString(36).substring(7),
      },
    });
    tenantId = tenant.id;

    const location = await testPrisma.location.create({
      data: {
        tenantId,
        name: 'Sucursal Principal',
        address: 'Av. Corrientes 1234',
      },
    });
    locationId = location.id;

    const user = await testPrisma.user.create({
      data: {
        email: 'test@pulso.dev',
        normalizedEmail: 'test@pulso.dev',
        name: 'Test Cashier',
        passwordHash: 'dummy',
      },
    });
    userId = user.id;

    await testPrisma.tenantMembership.create({
      data: {
        tenantId,
        userId,
        role: 'CASHIER',
        status: 'ACTIVE',
      },
    });

    const product = await testPrisma.product.create({
      data: {
        tenantId,
        name: 'Alfajor',
        normalizedName: 'alfajor',
        barcode: '7791234567890',
        salePriceCents: 120000,
        costPriceCents: 60000,
        isActive: true,
      },
    });
    productId = product.id;

    await testPrisma.productLocation.create({
      data: {
        productId,
        locationId,
        stockQuantity: 20,
        minimumStock: 5,
        isAvailable: true,
      },
    });

    validSession = {
      sessionId: 'sess-1',
      membershipId: 'mem-1',
      role: 'CASHIER',
      tenantId,
      locationId,
      userId,
      user: { id: userId, name: 'Test Cashier', email: 'test@pulso.dev' },
      tenant: { id: tenantId, name: 'Kiosco Test', slug: 'kiosco-test' },
      location: { id: locationId, name: 'Sucursal Principal' },
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('processes a new valid sale with verified session context', async () => {
    const command = {
      shiftId: 'shift-1',
      idempotencyKey: 'd3b07384-d113-4638-b4ea-4c91a0c8b211',
      items: [
        {
          productId,
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
    expect(res.sale.id).toBeDefined();
    expect(res.sale.totalCents).toBe(120000);
    expect(res.sale.tenantId).toBe(tenantId);
    expect(res.sale.locationId).toBe(locationId);
  });

  it('returns idempotent replay when receiving same idempotency key within tenant', async () => {
    const command = {
      shiftId: 'shift-1',
      idempotencyKey: 'c2a07384-d113-4638-b4ea-4c91a0c8b333',
      items: [
        {
          productId,
          name: 'Alfajor',
          quantity: 1,
          unitPriceCents: 120000,
          totalPriceCents: 120000,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 120000 }],
      totalCents: 120000,
      createdAtUtc: new Date().toISOString(),
    };

    // First call
    const firstRes = await service.processSale(command, validSession);
    expect(firstRes.idempotentReplay).toBe(false);

    // Replay call
    const secondRes = await service.processSale(command, validSession);
    expect(secondRes.idempotentReplay).toBe(true);
    expect(secondRes.sale.id).toBe(firstRes.sale.id);
  });

  it('strictly rejects sale processing when session context is missing or incomplete', async () => {
    const validCommand = {
      shiftId: 'shift-1',
      idempotencyKey: 'c2a07384-d113-4638-b4ea-4c91a0c8b333',
      items: [
        {
          productId,
          name: 'Alfajor',
          quantity: 1,
          unitPriceCents: 120000,
          totalPriceCents: 120000,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 120000 }],
      totalCents: 120000,
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
          productId,
          name: 'Alfajor',
          quantity: 1,
          unitPriceCents: 120000,
          totalPriceCents: 120000,
        },
      ],
      tenders: [{ type: 'CASH', amountCents: 120000 }],
      totalCents: 200000,
      createdAtUtc: new Date().toISOString(),
    };

    await expect(service.processSale(injectedCommand, validSession)).rejects.toThrow(
      BadRequestException
    );
  });
});
