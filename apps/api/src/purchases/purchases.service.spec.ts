import { ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import { describe, expect, it, vi } from 'vitest';
import { PurchasesService } from './purchases.service.js';

const session = {
  tenantId: 'tenant-a',
  locationId: 'location-a',
  userId: 'user-a',
} as SessionContext;

function purchase(overrides: Record<string, unknown> = {}) {
  return {
    id: 'purchase-a',
    tenantId: 'tenant-a',
    locationId: 'location-a',
    supplierId: 'supplier-a',
    status: 'DRAFT',
    documentNumber: null,
    purchasedAtUtc: new Date('2026-09-01T00:00:00.000Z'),
    receivedAtUtc: null,
    createdByUserId: 'user-a',
    receivedByUserId: null,
    cancelledByUserId: null,
    cancelledAtUtc: null,
    subtotalCents: 100,
    discountCents: 0,
    additionalCostCents: 0,
    totalCents: 100,
    paymentSource: 'UNSPECIFIED',
    cashShiftId: null,
    cashMovementId: null,
    idempotencyKey: null,
    notes: null,
    version: 3,
    createdAt: new Date('2026-09-01T00:00:00.000Z'),
    updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    items: [],
    supplier: { id: 'supplier-a', name: 'Supplier A', taxId: null },
    createdByUser: { id: 'user-a', name: 'Owner A', email: 'owner@example.com' },
    ...overrides,
  };
}

function createSubject(scopedPurchase: ReturnType<typeof purchase> | null) {
  const tx = {
    purchase: {
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    purchaseItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  const prisma = {
    purchase: { findFirst: vi.fn().mockResolvedValue(scopedPurchase) },
    supplier: { findFirst: vi.fn() },
    product: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  return {
    service: new PurchasesService(prisma as unknown as PrismaService),
    prisma,
    tx,
  };
}

describe('PurchasesService updateDraft concurrency', () => {
  it('returns scoped 404 before related validation when the purchase is inaccessible', async () => {
    const { service, prisma } = createSubject(null);

    await expect(
      service.updateDraft('purchase-a', { supplierId: 'missing-supplier' }, 3, session)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
    expect(prisma.product.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    ['stale version', purchase({ version: 4 }), 3],
    ['terminal status', purchase({ status: 'RECEIVED' }), 3],
  ])(
    'returns 409 for %s before invalid supplier or product validation',
    async (_case, current, expected) => {
      const { service, prisma } = createSubject(current);

      await expect(
        service.updateDraft(
          'purchase-a',
          {
            supplierId: 'missing-supplier',
            items: [{ productId: 'missing-product', quantity: 1, unitCostCents: 1 }],
          },
          expected,
          session
        )
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.supplier.findFirst).not.toHaveBeenCalled();
      expect(prisma.product.findMany).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  );

  it('uses the client version in the five-field CAS and increments exactly once', async () => {
    const current = purchase();
    const { service, tx } = createSubject(current);
    tx.purchase.updateMany.mockResolvedValue({ count: 1 });
    tx.purchase.findUniqueOrThrow.mockResolvedValue(purchase({ version: 4 }));

    const result = await service.updateDraft('purchase-a', { discountCents: 1 }, 3, session);

    expect(tx.purchase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'purchase-a',
          tenantId: 'tenant-a',
          locationId: 'location-a',
          status: 'DRAFT',
          version: 3,
        },
        data: expect.objectContaining({ version: { increment: 1 } }),
      })
    );
    expect(result).toMatchObject({ id: 'purchase-a', version: 4 });
  });

  it('does not replace items when the final CAS loses the race', async () => {
    const { service, prisma, tx } = createSubject(purchase());
    prisma.product.findMany.mockResolvedValue([
      { id: 'product-a', name: 'Product A', barcode: null, tenantId: 'tenant-a' },
    ]);
    tx.purchase.updateMany.mockResolvedValue({ count: 0 });
    tx.purchase.findFirst.mockResolvedValue({ id: 'purchase-a' });

    await expect(
      service.updateDraft(
        'purchase-a',
        { items: [{ productId: 'product-a', quantity: 2, unitCostCents: 50 }] },
        3,
        session
      )
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.purchaseItem.deleteMany).not.toHaveBeenCalled();
    expect(tx.purchaseItem.createMany).not.toHaveBeenCalled();
  });
});
