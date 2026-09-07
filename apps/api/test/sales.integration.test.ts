import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { RateLimiterService } from '../src/auth/rate-limiter.service.js';
import { hashPassword } from '../src/auth/security.utils.js';
import { Decimal } from '@prisma/client/runtime/library';
import type { SaleWarning } from '@pulso/contracts';
import { SalesService } from '../src/sales/sales.service.js';
import type { SessionContext } from '../src/auth/cookie.utils.js';

function extractCookieValue(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = cookies.find((c) => c.startsWith('pulso_session='));
  if (typeof found !== 'string') throw new Error('Expected pulso_session cookie was not found');
  const part = found.split(';')[0];
  return part ?? '';
}

describe('Sales & Stock Integration Suite (PostgreSQL Real)', () => {
  let app: INestApplication;
  let ownerCookieA: string;
  let cashierCookieA: string;
  let ownerCookieB: string;
  let tenantAId: string;
  let locationAId: string;
  let locationBId: string;
  let productA1Id: string;
  let productA2Id: string;
  let productB1Id: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await testPrisma.$disconnect();
  });

  beforeEach(async () => {
    await truncateAllTables();
    app.get(RateLimiterService).reset();

    // Register Tenant A (Owner)
    const regA = await request(app.getHttpServer()).post('/api/auth/register').send({
      businessName: 'Comercio A',
      locationName: 'Sucursal Centro',
      ownerName: 'Dueño A',
      email: 'dueno.a@pulso.dev',
      password: 'Password123!',
    });
    expect(regA.status).toBe(201);
    ownerCookieA = extractCookieValue(regA.headers);
    tenantAId = regA.body.tenant.id;
    locationAId = regA.body.location.id;

    // Create Cashier in Tenant A
    const cashierUser = await testPrisma.user.create({
      data: {
        email: 'cajero.a@pulso.dev',
        normalizedEmail: 'cajero.a@pulso.dev',
        name: 'Cajero A',
        passwordHash: await hashPassword('CashierPass123!'),
      },
    });
    await testPrisma.tenantMembership.create({
      data: {
        tenantId: tenantAId,
        userId: cashierUser.id,
        role: 'CASHIER',
      },
    });
    const cashierLogin = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'cajero.a@pulso.dev',
      password: 'CashierPass123!',
    });
    expect(cashierLogin.status).toBe(200);
    cashierCookieA = extractCookieValue(cashierLogin.headers);

    // Register Tenant B (Owner)
    const regB = await request(app.getHttpServer()).post('/api/auth/register').send({
      businessName: 'Comercio B',
      locationName: 'Sucursal Norte',
      ownerName: 'Dueño B',
      email: 'dueno.b@pulso.dev',
      password: 'Password123!',
    });
    expect(regB.status).toBe(201);
    ownerCookieB = extractCookieValue(regB.headers);
    locationBId = regB.body.location.id;

    // Create Products in Tenant A
    const p1 = await request(app.getHttpServer())
      .post('/api/products')
      .set('Cookie', ownerCookieA)
      .send({
        name: 'Coca Cola 500ml',
        barcode: '7791234567890',
        salePriceCents: 150000,
        unit: 'UNIT',
        initialStock: '10.0000',
        minimumStock: '2.0000',
      });
    expect(p1.status).toBe(201);
    productA1Id = p1.body.id;

    const p2 = await request(app.getHttpServer())
      .post('/api/products')
      .set('Cookie', ownerCookieA)
      .send({
        name: 'Alfajor Havanna',
        barcode: '7799876543210',
        salePriceCents: 200000,
        unit: 'UNIT',
        initialStock: '1.0000',
        minimumStock: '3.0000',
      });
    expect(p2.status).toBe(201);
    productA2Id = p2.body.id;

    // Create Product in Tenant B
    const pB = await request(app.getHttpServer())
      .post('/api/products')
      .set('Cookie', ownerCookieB)
      .send({
        name: 'Producto Rival B',
        barcode: '7791111111111',
        salePriceCents: 100000,
        unit: 'UNIT',
        initialStock: '50.0000',
      });
    expect(pB.status).toBe(201);
    productB1Id = pB.body.id;

    // Open shift in Tenant A so POS sales are permitted
    const shiftRes = await request(app.getHttpServer())
      .post('/api/cash/shifts/open')
      .set('Cookie', cashierCookieA)
      .send({
        openingAmountCents: 100000,
        idempotencyKey: '00000000-0000-4000-8000-0000000000aa',
      });
    expect(shiftRes.status).toBe(200);

    // Open shift in Tenant B so POS sales are permitted
    const shiftResB = await request(app.getHttpServer())
      .post('/api/cash/shifts/open')
      .set('Cookie', ownerCookieB)
      .send({
        openingAmountCents: 100000,
        idempotencyKey: '00000000-0000-4000-8000-0000000000bb',
      });
    expect(shiftResB.status).toBe(200);
  });

  describe('POST /api/sales - Transactional persistence & stock', () => {
    it('persists sale, decrements stock atomically, and creates InventoryMovement type SALE', async () => {
      const idempotencyKey = '11111111-1111-4111-a111-111111111111';
      const salePayload = {
        idempotencyKey,
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            barcode: '7791234567890',
            quantity: 2,
            unitPriceCents: 150000,
            totalPriceCents: 300000,
          },
        ],
        tenders: [
          {
            type: 'CASH',
            amountCents: 300000,
            receivedAmountCents: 500000,
            changeAmountCents: 200000,
          },
        ],
        totalCents: 300000,
        createdAtUtc: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(salePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.idempotentReplay).toBe(false);
      expect(res.body.sale).toBeDefined();
      expect(res.body.sale.totalCents).toBe(300000);
      expect(res.body.sale.status).toBe('COMPLETED');
      expect(res.body.sale.tenantId).toBe(tenantAId);
      expect(res.body.sale.locationId).toBe(locationAId);

      // Verify stock in database was decremented from 10 to 8
      const locSetting = await testPrisma.productLocation.findUnique({
        where: {
          productId_locationId: {
            productId: productA1Id,
            locationId: locationAId,
          },
        },
      });
      expect(new Decimal(locSetting!.stockQuantity).toString()).toBe('8');

      // Verify InventoryMovement record created
      const movement = await testPrisma.inventoryMovement.findFirst({
        where: {
          tenantId: tenantAId,
          locationId: locationAId,
          productId: productA1Id,
          type: 'SALE',
        },
      });
      expect(movement).toBeDefined();
      expect(movement!.saleId).toBe(res.body.sale.id);
      expect(new Decimal(movement!.delta).toString()).toBe('-2');
      expect(new Decimal(movement!.previousStock).toString()).toBe('10');
      expect(new Decimal(movement!.resultingStock).toString()).toBe('8');
    });

    it('returns idempotent replay without double-decrementing stock on duplicate request', async () => {
      const idempotencyKey = '22222222-2222-4222-a222-222222222222';
      const salePayload = {
        idempotencyKey,
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(salePayload);
      expect(res1.status).toBe(200);
      expect(res1.body.idempotentReplay).toBe(false);

      const res2 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(salePayload);
      expect(res2.status).toBe(200);
      expect(res2.body.idempotentReplay).toBe(true);
      expect(res2.body.sale.id).toBe(res1.body.sale.id);

      // Stock must be 9, NOT 8!
      const locSetting = await testPrisma.productLocation.findUnique({
        where: {
          productId_locationId: {
            productId: productA1Id,
            locationId: locationAId,
          },
        },
      });
      expect(new Decimal(locSetting!.stockQuantity).toString()).toBe('9');
    });

    it('rejects tampered prices or line totals manipulated by client', async () => {
      const salePayload = {
        idempotencyKey: '33333333-3333-4333-a333-333333333333',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 2,
            unitPriceCents: 150000,
            totalPriceCents: 100000, // Tampered line total (2 * 150000 !== 100000)
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100000 }],
        totalCents: 100000,
        createdAtUtc: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(salePayload);

      expect(res.status).toBe(400);

      // Stock remains untouched at 10
      const locSetting = await testPrisma.productLocation.findUnique({
        where: {
          productId_locationId: {
            productId: productA1Id,
            locationId: locationAId,
          },
        },
      });
      expect(new Decimal(locSetting!.stockQuantity).toString()).toBe('10');
    });

    it('rejects sale referencing product belonging to another tenant and rolls back', async () => {
      const salePayload = {
        idempotencyKey: '44444444-4444-4444-a444-444444444444',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
          {
            productId: productB1Id, // Belongs to Tenant B!
            name: 'Producto Rival B',
            quantity: 1,
            unitPriceCents: 100000,
            totalPriceCents: 100000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 250000 }],
        totalCents: 250000,
        createdAtUtc: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(salePayload);

      expect(res.status).toBe(400);

      // Neither product should have decremented stock
      const locA = await testPrisma.productLocation.findUnique({
        where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
      });
      expect(new Decimal(locA!.stockQuantity).toString()).toBe('10');

      const locB = await testPrisma.productLocation.findUnique({
        where: { productId_locationId: { productId: productB1Id, locationId: locationBId } },
      });
      expect(new Decimal(locB!.stockQuantity).toString()).toBe('50');
    });

    it('allows negative stock but returns informative warnings (belowZero, belowMin)', async () => {
      // productA2 has initial stock 1 and minimum stock 3
      const salePayload = {
        idempotencyKey: '55555555-5555-4555-a555-555555555555',
        items: [
          {
            productId: productA2Id,
            name: 'Alfajor Havanna',
            quantity: 3, // 1 - 3 = -2
            unitPriceCents: 200000,
            totalPriceCents: 600000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 600000 }],
        totalCents: 600000,
        createdAtUtc: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(salePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.warnings).toHaveLength(1);
      expect(res.body.warnings[0].productId).toBe(productA2Id);
      expect(res.body.warnings[0].belowZero).toBe(true);
      expect(res.body.warnings[0].belowMin).toBe(true);

      const loc = await testPrisma.productLocation.findUnique({
        where: { productId_locationId: { productId: productA2Id, locationId: locationAId } },
      });
      expect(new Decimal(loc!.stockQuantity).toString()).toBe('-2');
    });
  });

  describe('GET /api/sales - History & Pagination', () => {
    it('returns 401 on GET /api/sales without a session cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/sales');
      expect(res.status).toBe(401);
    });

    it('returns 401 on GET /api/sales/:id without a session cookie', async () => {
      const res = await request(app.getHttpServer()).get('/api/sales/nonexistent-id');
      expect(res.status).toBe(401);
    });

    it('lists persisted sales with pagination and isolation per tenant/location', async () => {
      // Create 2 sales in Tenant A
      await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'aaaa1111-1111-4111-a111-111111111111',
          items: [
            {
              productId: productA1Id,
              name: 'Coca Cola 500ml',
              quantity: 1,
              unitPriceCents: 150000,
              totalPriceCents: 150000,
            },
          ],
          tenders: [{ type: 'CASH', amountCents: 150000 }],
          totalCents: 150000,
          createdAtUtc: new Date(Date.now() - 10000).toISOString(),
        });

      await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'aaaa2222-2222-4222-a222-222222222222',
          items: [
            {
              productId: productA1Id,
              name: 'Coca Cola 500ml',
              quantity: 2,
              unitPriceCents: 150000,
              totalPriceCents: 300000,
            },
          ],
          tenders: [{ type: 'DEBIT', amountCents: 300000 }],
          totalCents: 300000,
          createdAtUtc: new Date().toISOString(),
        });

      // Query from Cashier A
      const resA = await request(app.getHttpServer())
        .get('/api/sales?page=1&limit=10')
        .set('Cookie', cashierCookieA);

      expect(resA.status).toBe(200);
      expect(resA.body.items).toHaveLength(2);
      expect(resA.body.total).toBe(2);

      // Query from Owner B: must see 0 sales
      const resB = await request(app.getHttpServer())
        .get('/api/sales?page=1&limit=10')
        .set('Cookie', ownerCookieB);

      expect(resB.status).toBe(200);
      expect(resB.body.items).toHaveLength(0);
      expect(resB.body.total).toBe(0);
    });

    it('retrieves single sale details by id with items and tenders', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'bbbb1111-1111-4111-a111-111111111111',
          items: [
            {
              productId: productA1Id,
              name: 'Coca Cola 500ml',
              quantity: 1,
              unitPriceCents: 150000,
              totalPriceCents: 150000,
            },
          ],
          tenders: [
            {
              type: 'CASH',
              amountCents: 150000,
              receivedAmountCents: 200000,
              changeAmountCents: 50000,
            },
          ],
          totalCents: 150000,
          createdAtUtc: new Date().toISOString(),
        });

      const saleId = createRes.body.sale.id;

      const getRes = await request(app.getHttpServer())
        .get(`/api/sales/${saleId}`)
        .set('Cookie', cashierCookieA);

      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(saleId);
      expect(getRes.body.items).toHaveLength(1);
      expect(getRes.body.tenders).toHaveLength(1);
      expect(getRes.body.tenders[0].receivedAmountCents).toBe(200000);
      expect(getRes.body.tenders[0].changeAmountCents).toBe(50000);

      // Tenant B cannot access Tenant A's sale
      const getResB = await request(app.getHttpServer())
        .get(`/api/sales/${saleId}`)
        .set('Cookie', ownerCookieB);

      expect(getResB.status).toBe(404);
    });

    it('searches sales by barcode, product name, id, and idempotencyKey with tenant isolation', async () => {
      // Create Sale 1 with Coca Cola (barcode: 7791234567890)
      const resSale1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'dddd1111-1111-4111-a111-111111111111',
          items: [
            {
              productId: productA1Id,
              name: 'Coca Cola 500ml',
              quantity: 1,
              unitPriceCents: 150000,
              totalPriceCents: 150000,
            },
          ],
          tenders: [{ type: 'CASH', amountCents: 150000 }],
          totalCents: 150000,
          createdAtUtc: new Date().toISOString(),
        });
      expect(resSale1.status).toBe(200);
      const sale1Id = resSale1.body.sale.id;

      // Create Sale 2 with Alfajor Havanna (barcode: 7799876543210)
      const resSale2 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'dddd2222-2222-4222-a222-222222222222',
          items: [
            {
              productId: productA2Id,
              name: 'Alfajor Havanna',
              quantity: 1,
              unitPriceCents: 200000,
              totalPriceCents: 200000,
            },
          ],
          tenders: [{ type: 'CASH', amountCents: 200000 }],
          totalCents: 200000,
          createdAtUtc: new Date().toISOString(),
        });
      expect(resSale2.status).toBe(200);
      const sale2Id = resSale2.body.sale.id;

      // 1. Search by exact barcode of product A1
      const resByBarcode = await request(app.getHttpServer())
        .get('/api/sales?search=7791234567890')
        .set('Cookie', cashierCookieA);
      expect(resByBarcode.status).toBe(200);
      expect(resByBarcode.body.items).toHaveLength(1);
      expect(resByBarcode.body.items[0].id).toBe(sale1Id);

      // 2. Search by partial barcode of product A2
      const resByPartialBarcode = await request(app.getHttpServer())
        .get('/api/sales?search=87654')
        .set('Cookie', cashierCookieA);
      expect(resByPartialBarcode.status).toBe(200);
      expect(resByPartialBarcode.body.items).toHaveLength(1);
      expect(resByPartialBarcode.body.items[0].id).toBe(sale2Id);

      // 3. Search by product name
      const resByName = await request(app.getHttpServer())
        .get('/api/sales?search=havanna')
        .set('Cookie', cashierCookieA);
      expect(resByName.status).toBe(200);
      expect(resByName.body.items).toHaveLength(1);
      expect(resByName.body.items[0].id).toBe(sale2Id);

      // 4. Search by sale ID
      const resById = await request(app.getHttpServer())
        .get(`/api/sales?search=${sale1Id}`)
        .set('Cookie', cashierCookieA);
      expect(resById.status).toBe(200);
      expect(resById.body.items).toHaveLength(1);
      expect(resById.body.items[0].id).toBe(sale1Id);

      // 5. Search by idempotencyKey
      const resByIdem = await request(app.getHttpServer())
        .get('/api/sales?search=dddd1111')
        .set('Cookie', cashierCookieA);
      expect(resByIdem.status).toBe(200);
      expect(resByIdem.body.items).toHaveLength(1);
      expect(resByIdem.body.items[0].id).toBe(sale1Id);

      // 6. Tenant isolation: search with barcode of Tenant B's product
      const resIsolation = await request(app.getHttpServer())
        .get('/api/sales?search=7791111111111')
        .set('Cookie', cashierCookieA);
      expect(resIsolation.status).toBe(200);
      expect(resIsolation.body.items).toHaveLength(0);
    });

    it('enforces single date range contract YYYY-MM-DD on GET /api/sales and rejects invalid inputs with 400', async () => {
      // Impossible calendar date
      const res1 = await request(app.getHttpServer())
        .get('/api/sales?from=2026-02-31')
        .set('Cookie', cashierCookieA);
      expect(res1.status).toBe(400);
      expect(res1.body.message).toContain('Fecha de calendario inexistente en "from"');

      // Invalid format with time
      const res2 = await request(app.getHttpServer())
        .get('/api/sales?from=2026-06-01T10:00:00Z')
        .set('Cookie', cashierCookieA);
      expect(res2.status).toBe(400);
      expect(res2.body.message).toContain('exclusivamente YYYY-MM-DD');

      // from > to
      const res3 = await request(app.getHttpServer())
        .get('/api/sales?from=2026-06-10&to=2026-06-01')
        .set('Cookie', cashierCookieA);
      expect(res3.status).toBe(400);
      expect(res3.body.message).toContain('no puede ser posterior');
    });
  });

  describe('Stock Concurrency & Lost Updates Prevention', () => {
    it('handles concurrent sales for same product without lost updates (10 -> 9 -> 8) under Promise.all', async () => {
      // productA1 starts with stock 10
      const sale1Payload = {
        idempotencyKey: 'cccc1111-1111-4111-a111-111111111111',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      const sale2Payload = {
        idempotencyKey: 'cccc2222-2222-4222-a222-222222222222',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/sales')
          .set('Cookie', cashierCookieA)
          .send(sale1Payload),
        request(app.getHttpServer())
          .post('/api/sales')
          .set('Cookie', cashierCookieA)
          .send(sale2Payload),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res2.body.success).toBe(true);
      expect(res1.body.idempotentReplay).toBe(false);
      expect(res2.body.idempotentReplay).toBe(false);

      // Final stock must be exactly 8
      const locSetting = await testPrisma.productLocation.findUnique({
        where: {
          productId_locationId: {
            productId: productA1Id,
            locationId: locationAId,
          },
        },
      });
      expect(new Decimal(locSetting!.stockQuantity).toString()).toBe('8');

      // Check movements: two distinct SALE movements forming a sequence 10 -> 9 -> 8
      // Order deterministically by previousStock descending without relying on accidental timestamp order
      const movements = await testPrisma.inventoryMovement.findMany({
        where: {
          productId: productA1Id,
          type: 'SALE',
        },
        orderBy: [{ previousStock: 'desc' }, { id: 'asc' }],
      });

      expect(movements).toHaveLength(2);
      expect(movements[0]?.id).not.toBe(movements[1]?.id);

      const sequences = movements.map((m) => ({
        prev: new Decimal(m.previousStock).toString(),
        res: new Decimal(m.resultingStock).toString(),
      }));

      // Structural check: exactly one 10 -> 9, and one 9 -> 8, without lost updates
      expect(sequences).toEqual([
        { prev: '10', res: '9' },
        { prev: '9', res: '8' },
      ]);

      // Verify two distinct sales exist
      const totalSales = await testPrisma.sale.count({
        where: {
          tenantId: tenantAId,
          locationId: locationAId,
          idempotencyKey: { in: [sale1Payload.idempotencyKey, sale2Payload.idempotencyKey] },
        },
      });
      expect(totalSales).toBe(2);
    });
  });

  describe('Vendible Products Validation & Server Snapshots', () => {
    it('rejects and rolls back when Product.isActive is false', async () => {
      // Deactivate productA1
      await testPrisma.product.update({
        where: { id: productA1Id },
        data: { isActive: false },
      });

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'dddd1111-1111-4111-a111-111111111111',
          items: [
            {
              productId: productA1Id,
              name: 'Coca Cola 500ml',
              quantity: 1,
              unitPriceCents: 150000,
              totalPriceCents: 150000,
            },
          ],
          tenders: [{ type: 'CASH', amountCents: 150000 }],
          totalCents: 150000,
          createdAtUtc: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/inactivo|no está activo/i);

      // Verify no sale created
      const sale = await testPrisma.sale.findFirst({
        where: { idempotencyKey: 'dddd1111-1111-4111-a111-111111111111' },
      });
      expect(sale).toBeNull();
    });

    it('rejects and rolls back when ProductLocation does not exist without creating it', async () => {
      // Create product without location settings
      const orphanedProduct = await testPrisma.product.create({
        data: {
          tenantId: tenantAId,
          name: 'Producto Sin Sucursal',
          normalizedName: 'producto sin sucursal',
          salePriceCents: 50000,
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'dddd2222-2222-4222-a222-222222222222',
          items: [
            {
              productId: orphanedProduct.id,
              name: 'Producto Sin Sucursal',
              quantity: 1,
              unitPriceCents: 50000,
              totalPriceCents: 50000,
            },
          ],
          tenders: [{ type: 'CASH', amountCents: 50000 }],
          totalCents: 50000,
          createdAtUtc: new Date().toISOString(),
        });

      expect(res.status).toBe(400);

      // Crucial: ProductLocation must NOT have been auto-created!
      const pl = await testPrisma.productLocation.findUnique({
        where: {
          productId_locationId: {
            productId: orphanedProduct.id,
            locationId: locationAId,
          },
        },
      });
      expect(pl).toBeNull();
    });

    it('rejects and rolls back when ProductLocation.isAvailable is false', async () => {
      // Set isAvailable = false
      await testPrisma.productLocation.update({
        where: {
          productId_locationId: {
            productId: productA1Id,
            locationId: locationAId,
          },
        },
        data: { isAvailable: false },
      });

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'dddd3333-3333-4333-a333-333333333333',
          items: [
            {
              productId: productA1Id,
              name: 'Coca Cola 500ml',
              quantity: 1,
              unitPriceCents: 150000,
              totalPriceCents: 150000,
            },
          ],
          tenders: [{ type: 'CASH', amountCents: 150000 }],
          totalCents: 150000,
          createdAtUtc: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/no está disponible|disponible/i);
    });

    it('enforces server snapshots for name and barcode, ignoring forged client text', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'dddd4444-4444-4444-a444-444444444444',
          items: [
            {
              productId: productA1Id,
              name: 'CLIENT_FORGED_NAME',
              barcode: '9999999999999',
              quantity: 1,
              unitPriceCents: 150000,
              totalPriceCents: 150000,
            },
          ],
          tenders: [{ type: 'CASH', amountCents: 150000 }],
          totalCents: 150000,
          createdAtUtc: new Date().toISOString(),
        });

      expect(res.status).toBe(200);

      // Verify SaleItem in DB has real server name and barcode
      const sale = await testPrisma.sale.findUnique({
        where: { id: res.body.sale.id },
        include: { items: true },
      });

      expect(sale!.items[0]?.name).toBe('Coca Cola 500ml');
      expect(sale!.items[0]?.barcode).toBe('7791234567890');
    });
  });

  describe('POST /api/sync/batch - Independent Partial Processing & Replay', () => {
    it('processes batch [valid, invalid, valid] returning SYNCED, FAILED, SYNCED without stopping or duplicating', async () => {
      const op1Id = '99990001-0001-4001-a001-000000000001';
      const op2Id = '99990002-0002-4002-a002-000000000002';
      const op3Id = '99990003-0003-4003-a003-000000000003';

      const batch = {
        deviceId: 'pos-term-1',
        operations: [
          {
            operationId: op1Id,
            type: 'CREATE_SALE',
            payload: {
              idempotencyKey: op1Id,
              items: [
                {
                  productId: productA1Id,
                  name: 'Coca Cola 500ml',
                  quantity: 1,
                  unitPriceCents: 150000,
                  totalPriceCents: 150000,
                },
              ],
              tenders: [{ type: 'CASH', amountCents: 150000 }],
              totalCents: 150000,
              createdAtUtc: new Date().toISOString(),
            },
          },
          {
            operationId: op2Id,
            type: 'CREATE_SALE',
            payload: {
              idempotencyKey: op2Id,
              items: [
                {
                  productId: 'non-existent-product-id',
                  name: 'Fantasma',
                  quantity: 1,
                  unitPriceCents: 1000,
                  totalPriceCents: 1000,
                },
              ],
              tenders: [{ type: 'CASH', amountCents: 1000 }],
              totalCents: 1000,
              createdAtUtc: new Date().toISOString(),
            },
          },
          {
            operationId: op3Id,
            type: 'CREATE_SALE',
            payload: {
              idempotencyKey: op3Id,
              items: [
                {
                  productId: productA1Id,
                  name: 'Coca Cola 500ml',
                  quantity: 1,
                  unitPriceCents: 150000,
                  totalPriceCents: 150000,
                },
              ],
              tenders: [{ type: 'CASH', amountCents: 150000 }],
              totalCents: 150000,
              createdAtUtc: new Date().toISOString(),
            },
          },
        ],
      };

      const res = await request(app.getHttpServer())
        .post('/api/sync/batch')
        .set('Cookie', cashierCookieA)
        .send(batch);

      expect(res.status).toBe(200);
      expect(res.body.syncedCount).toBe(2);
      expect(res.body.results).toHaveLength(3);

      expect(res.body.results[0].status).toBe('SYNCED');
      expect(res.body.results[0].operationId).toBe(op1Id);

      expect(res.body.results[1].status).toBe('FAILED');
      expect(res.body.results[1].operationId).toBe(op2Id);
      expect(res.body.results[1].error).toBeDefined();

      expect(res.body.results[2].status).toBe('SYNCED');
      expect(res.body.results[2].operationId).toBe(op3Id);

      // Replaying the same batch does NOT re-decrement stock or error on synced ones
      const replayRes = await request(app.getHttpServer())
        .post('/api/sync/batch')
        .set('Cookie', cashierCookieA)
        .send(batch);

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.results[0].status).toBe('SYNCED');
      expect(replayRes.body.results[0].idempotentReplay).toBe(true);
      expect(replayRes.body.results[1].status).toBe('FAILED');
      expect(replayRes.body.results[2].status).toBe('SYNCED');
      expect(replayRes.body.results[2].idempotentReplay).toBe(true);
    });
  });

  describe('Offline Price Divergence Policy', () => {
    it('preserves historical charged price when catalog price changed, recording an auditable warning', async () => {
      // 1. ProductA1 catalog price is currently 150000 ($1500). Change catalog to 180000 ($1800).
      await testPrisma.product.update({
        where: { id: productA1Id },
        data: { salePriceCents: 180000 },
      });

      // 2. An offline sale occurred before the price change at 150000 ($1500)
      const offlineSalePayload = {
        idempotencyKey: 'eeee1111-1111-4111-a111-111111111111',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(offlineSalePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sale.totalCents).toBe(150000);

      // SaleItem preserved the historical charged unit price
      const dbSale = await testPrisma.sale.findUnique({
        where: { id: res.body.sale.id },
        include: { items: true },
      });
      expect(dbSale!.totalCents).toBe(150000);
      expect(dbSale!.items[0]?.unitPriceCents).toBe(150000);

      // Warning recorded about price divergence
      expect(res.body.warnings.length).toBeGreaterThanOrEqual(1);
      const priceWarning = res.body.warnings.find(
        (w: SaleWarning) => w.productId === productA1Id && w.priceDivergence
      );
      expect(priceWarning).toBeDefined();
      expect(priceWarning.priceDivergence.chargedUnitPriceCents).toBe(150000);
      expect(priceWarning.priceDivergence.catalogUnitPriceCents).toBe(180000);
    });
  });

  describe('Date Filter Semantics ("Hasta" and Range Validation)', () => {
    it('includes sales at midday and 23:59:59.999 of "Hasta", excludes next day, and accepts equal from/to', async () => {
      // Create sales with specific createdAtUtc
      const saleMiddayPayload = {
        idempotencyKey: 'a0000001-0000-4000-a000-000000000001',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: '2026-05-15T12:00:00.000Z',
      };
      await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(saleMiddayPayload);

      const saleEndOfDayPayload = {
        idempotencyKey: 'a0000002-0000-4000-a000-000000000002',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: '2026-05-15T23:59:59.999Z',
      };
      await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(saleEndOfDayPayload);

      const saleNextDayPayload = {
        idempotencyKey: 'a0000003-0000-4000-a000-000000000003',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: '2026-05-16T00:00:00.000Z',
      };
      await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(saleNextDayPayload);

      // Query with from=2026-05-15&to=2026-05-15 (equal dates should cover whole day 2026-05-15)
      const res = await request(app.getHttpServer())
        .get('/api/sales?from=2026-05-15&to=2026-05-15')
        .set('Cookie', cashierCookieA);

      expect(res.status).toBe(200);
      const keys = res.body.items.map((s: { idempotencyKey: string }) => s.idempotencyKey);
      expect(keys).toContain('a0000001-0000-4000-a000-000000000001');
      expect(keys).toContain('a0000002-0000-4000-a000-000000000002');
      expect(keys).not.toContain('a0000003-0000-4000-a000-000000000003');
    });

    it('returns 400 when date string is invalid', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?from=invalida&to=2026-05-15')
        .set('Cookie', cashierCookieA);

      expect(res.status).toBe(400);
    });

    it('returns 400 when from is after to', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?from=2026-05-20&to=2026-05-10')
        .set('Cookie', cashierCookieA);

      expect(res.status).toBe(400);
    });

    it('returns 400 when date suffers from silent rollover (e.g. 2026-02-31, 2026-04-31, 2025-02-29 non-leap year)', async () => {
      // 2026-02-31 (February has 28 days in 2026)
      const res1 = await request(app.getHttpServer())
        .get('/api/sales?from=2026-02-31')
        .set('Cookie', cashierCookieA);
      expect(res1.status).toBe(400);

      // 2026-04-31 (April has 30 days)
      const res2 = await request(app.getHttpServer())
        .get('/api/sales?to=2026-04-31')
        .set('Cookie', cashierCookieA);
      expect(res2.status).toBe(400);

      // 2025-02-29 (not a leap year)
      const res3 = await request(app.getHttpServer())
        .get('/api/sales?from=2025-02-29')
        .set('Cookie', cashierCookieA);
      expect(res3.status).toBe(400);

      // Out of bounds months: 2026-13-01 and 2026-00-10
      const res4 = await request(app.getHttpServer())
        .get('/api/sales?from=2026-13-01')
        .set('Cookie', cashierCookieA);
      expect(res4.status).toBe(400);

      const res5 = await request(app.getHttpServer())
        .get('/api/sales?from=2026-00-10')
        .set('Cookie', cashierCookieA);
      expect(res5.status).toBe(400);

      // Invalid text strings
      const res6 = await request(app.getHttpServer())
        .get('/api/sales?to=abc')
        .set('Cookie', cashierCookieA);
      expect(res6.status).toBe(400);

      // 2024-02-29 (leap year) is valid and returns 200
      const resLeap = await request(app.getHttpServer())
        .get('/api/sales?from=2024-02-29&to=2024-02-29')
        .set('Cookie', cashierCookieA);
      expect(resLeap.status).toBe(200);
    });
  });

  describe('QuerySales Pagination, Parameter Validation & Hard Limits', () => {
    it('accepts page=1 and valid limit within max', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?page=1&limit=50')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(50);
    });

    it('rejects page=abc with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?page=abc')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('página');
    });

    it('rejects page=2abc with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?page=2abc')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('página');
    });

    it('rejects page=0 with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?page=0')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(400);
    });

    it('rejects page=-1 with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?page=-1')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(400);
    });

    it('rejects page=1.5 with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?page=1.5')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(400);
    });

    it('rejects limit=0 with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?limit=0')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(400);
    });

    it('rejects negative limit with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?limit=-5')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(400);
    });

    it('rejects limit superior al maximo (101) with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?limit=101')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(400);
    });

    it('fechas y búsqueda continúan funcionando con paginación válida', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sales?page=1&limit=10&from=2026-05-15&to=2026-05-15&search=Coca')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('Strict Idempotency, Payload Equivalence & Cross-Branch Isolation', () => {
    it('returns idempotentReplay=true for exact repeat in same branch', async () => {
      const payload = {
        idempotencyKey: 'b0000001-0000-4000-b000-000000000001',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      const firstRes = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(payload);
      expect(firstRes.status).toBe(200);
      expect(firstRes.body.idempotentReplay).toBe(false);

      const replayRes = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(payload);
      expect(replayRes.status).toBe(200);
      expect(replayRes.body.idempotentReplay).toBe(true);
      expect(replayRes.body.sale.id).toBe(firstRes.body.sale.id);
    });

    it('returns 409 Conflict when the same key is reused with a different payload (mismatched items or totals)', async () => {
      const originalPayload = {
        idempotencyKey: 'b0000002-0000-4000-b000-000000000002',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(originalPayload);
      expect(res1.status).toBe(200);

      // Attempt with same key but quantity 2 / total 300000
      const diffPayload = {
        idempotencyKey: 'b0000002-0000-4000-b000-000000000002',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 2,
            unitPriceCents: 150000,
            totalPriceCents: 300000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 300000 }],
        totalCents: 300000,
        createdAtUtc: new Date().toISOString(),
      };

      const res2 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(diffPayload);
      expect(res2.status).toBe(409);
    });

    it('returns 409 Conflict and never leaks data when same key is used in another branch of the same tenant', async () => {
      // Create a second branch in Tenant A
      const branch2 = await testPrisma.location.create({
        data: {
          tenantId: tenantAId,
          name: 'Sucursal Sur',
        },
      });

      // Give product availability in branch 2
      await testPrisma.productLocation.create({
        data: {
          productId: productA1Id,
          locationId: branch2.id,
          stockQuantity: new Decimal('20.0000'),
          minimumStock: new Decimal('2.0000'),
          isAvailable: true,
        },
      });

      // Create cashier in branch 2
      const cashierUser2 = await testPrisma.user.create({
        data: {
          email: 'cajero.sur@pulso.dev',
          normalizedEmail: 'cajero.sur@pulso.dev',
          name: 'Cajero Sur',
          passwordHash: await hashPassword('CashierPass123!'),
        },
      });
      await testPrisma.tenantMembership.create({
        data: {
          tenantId: tenantAId,
          userId: cashierUser2.id,
          role: 'CASHIER',
        },
      });

      // First sale in branch 1
      const payloadBranch1 = {
        idempotencyKey: 'b0000003-0000-4000-b000-000000000003',
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };
      const res1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(payloadBranch1);
      expect(res1.status).toBe(200);

      // Try same key in branch2 session
      const salesService = app.get(SalesService);
      const branch2Session: SessionContext = {
        sessionId: 'sess-branch2',
        userId: cashierUser2.id,
        tenantId: tenantAId,
        locationId: branch2.id,
        membershipId: 'mem-branch2',
        role: 'CASHIER',
        user: { id: cashierUser2.id, email: 'cashier2@kiosco.com', name: 'Cashier 2' },
        tenant: { id: tenantAId, name: 'Tenant A', slug: 'tenant-a' },
        location: { id: branch2.id, name: 'Sucursal 2' },
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };

      await expect(salesService.processSale(payloadBranch1, branch2Session)).rejects.toThrow();
    });

    it('isolates the same idempotency key across different tenants without collision', async () => {
      // Product in Tenant B
      const pB = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieB)
        .send({
          name: 'Galletitas',
          barcode: '7799999999999',
          salePriceCents: 100000,
          unit: 'UNIT',
          initialStock: '10.0000',
          minimumStock: '2.0000',
        });
      expect(pB.status).toBe(201);

      const sharedKey = 'c0000001-0000-4000-c000-000000000001';

      const saleTenantA = {
        idempotencyKey: sharedKey,
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      const saleTenantB = {
        idempotencyKey: sharedKey,
        items: [
          {
            productId: pB.body.id,
            name: 'Galletitas',
            quantity: 1,
            unitPriceCents: 100000,
            totalPriceCents: 100000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100000 }],
        totalCents: 100000,
        createdAtUtc: new Date().toISOString(),
      };

      const resA = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(saleTenantA);
      expect(resA.status).toBe(200);

      const resB = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', ownerCookieB)
        .send(saleTenantB);
      expect(resB.status).toBe(200);
      expect(resA.body.sale.id).not.toBe(resB.body.sale.id);
    });

    it('concurrent identical requests result in exactly one sale, one stock deduction and one movement', async () => {
      const sharedKey = 'c0000002-0000-4000-c000-000000000002';
      const payload = {
        idempotencyKey: sharedKey,
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      const stockBefore = await testPrisma.productLocation.findUnique({
        where: {
          productId_locationId: {
            productId: productA1Id,
            locationId: locationAId,
          },
        },
      });
      const initialStockNum = parseFloat(stockBefore!.stockQuantity.toString());

      // Send 2 identical requests concurrently
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post('/api/sales').set('Cookie', cashierCookieA).send(payload),
        request(app.getHttpServer()).post('/api/sales').set('Cookie', cashierCookieA).send(payload),
      ]);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Exactly one was original, one was replay
      const replays = [res1.body.idempotentReplay, res2.body.idempotentReplay];
      expect(replays).toContain(false);
      expect(replays).toContain(true);

      // Total sales in DB with this key must be exactly 1
      const count = await testPrisma.sale.count({
        where: { tenantId: tenantAId, idempotencyKey: sharedKey },
      });
      expect(count).toBe(1);

      // Stock deducted only once
      const stockAfter = await testPrisma.productLocation.findUnique({
        where: {
          productId_locationId: {
            productId: productA1Id,
            locationId: locationAId,
          },
        },
      });
      expect(parseFloat(stockAfter!.stockQuantity.toString())).toBe(initialStockNum - 1);

      // Only 1 SALE movement
      const movements = await testPrisma.inventoryMovement.findMany({
        where: { tenantId: tenantAId, locationId: locationAId, type: 'SALE' },
      });
      const keyMovements = movements.filter((m) => m.saleId === res1.body.sale.id);
      expect(keyMovements.length).toBe(1);
    });

    it('returns 200 with idempotentReplay=true when items and tenders are in different order', async () => {
      const p2 = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Alfajor Triple',
          barcode: '7798888888888',
          salePriceCents: 50000,
          unit: 'UNIT',
          initialStock: '10.0000',
          minimumStock: '2.0000',
        });
      expect(p2.status).toBe(201);

      const idemKey = 'c0000003-0000-4000-c000-000000000003';
      const originalDate = '2026-06-01T14:00:00.000Z';

      const order1 = {
        idempotencyKey: idemKey,
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
          {
            productId: p2.body.id,
            name: 'Alfajor Triple',
            quantity: 1,
            unitPriceCents: 50000,
            totalPriceCents: 50000,
          },
        ],
        tenders: [
          { type: 'CASH', amountCents: 100000, receivedAmountCents: 100000, changeAmountCents: 0 },
          { type: 'DEBIT', amountCents: 100000, reference: 'POS-AUTH-123' },
        ],
        totalCents: 200000,
        createdAtUtc: originalDate,
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(order1);
      expect(res1.status).toBe(200);
      expect(res1.body.idempotentReplay).toBe(false);

      // Replay with reversed items and reversed tenders
      const orderReversed = {
        idempotencyKey: idemKey,
        items: [
          {
            productId: p2.body.id,
            name: 'Alfajor Triple',
            quantity: 1,
            unitPriceCents: 50000,
            totalPriceCents: 50000,
          },
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [
          { type: 'DEBIT', amountCents: 100000, reference: 'POS-AUTH-123' },
          { type: 'CASH', amountCents: 100000, receivedAmountCents: 100000, changeAmountCents: 0 },
        ],
        totalCents: 200000,
        createdAtUtc: originalDate,
      };

      const resReplay = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(orderReversed);
      expect(resReplay.status).toBe(200);
      expect(resReplay.body.idempotentReplay).toBe(true);
      expect(resReplay.body.sale.id).toBe(res1.body.sale.id);
    });

    it('returns 409 Conflict when replay has altered shiftId', async () => {
      const idemKey = 'c0000004-0000-4000-c000-000000000004';
      const date = '2026-06-01T15:00:00.000Z';

      const payload = {
        shiftId: 'shift-1',
        idempotencyKey: idemKey,
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: date,
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(payload);
      expect(res1.status).toBe(200);

      // Replay with altered shiftId
      const res2 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          ...payload,
          shiftId: 'shift-altered-99',
        });
      expect(res2.status).toBe(409);
    });

    it('enforces exact millisecond match on createdAtUtc replay: 200 on exact match, 409 on 1ms, 500ms, and 1000ms drift', async () => {
      const idemKey = 'c0000005-0000-4000-c000-000000000005';
      const baseIso = '2026-06-01T10:00:00.000Z';
      const baseEpoch = new Date(baseIso).getTime();

      const payload = {
        idempotencyKey: idemKey,
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: baseIso,
      };

      // 1. Initial creation
      const res1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(payload);
      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.idempotentReplay).toBe(false);

      // 2. Exact match replay -> 200 OK with idempotentReplay: true
      const resExact = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(payload);
      expect(resExact.status).toBe(200);
      expect(resExact.body.idempotentReplay).toBe(true);
      expect(resExact.body.sale.id).toBe(res1.body.sale.id);

      // 3. Replay with 1ms difference -> 409 Conflict
      const res1ms = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          ...payload,
          createdAtUtc: new Date(baseEpoch + 1).toISOString(),
        });
      expect(res1ms.status).toBe(409);

      // 4. Replay with 500ms difference -> 409 Conflict
      const res500ms = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          ...payload,
          createdAtUtc: new Date(baseEpoch + 500).toISOString(),
        });
      expect(res500ms.status).toBe(409);

      // 5. Replay with 1000ms difference -> 409 Conflict
      const res1000ms = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          ...payload,
          createdAtUtc: new Date(baseEpoch + 1000).toISOString(),
        });
      expect(res1000ms.status).toBe(409);
    });

    it('returns 409 Conflict when replay has altered receivedAmountCents, changeAmountCents, or reference', async () => {
      const idemKey = 'c0000006-0000-4000-c000-000000000006';
      const date = '2026-06-01T16:00:00.000Z';

      const payload = {
        idempotencyKey: idemKey,
        items: [
          {
            productId: productA1Id,
            name: 'Coca Cola 500ml',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [
          {
            type: 'CASH',
            amountCents: 150000,
            receivedAmountCents: 200000,
            changeAmountCents: 50000,
            reference: 'REC-001',
          },
        ],
        totalCents: 150000,
        createdAtUtc: date,
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(payload);
      expect(res1.status).toBe(200);

      // 1. Altered receivedAmountCents
      const resRecv = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          ...payload,
          tenders: [
            {
              type: 'CASH',
              amountCents: 150000,
              receivedAmountCents: 300000,
              changeAmountCents: 50000,
              reference: 'REC-001',
            },
          ],
        });
      expect(resRecv.status).toBe(409);

      // 2. Altered changeAmountCents
      const resChange = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          ...payload,
          tenders: [
            {
              type: 'CASH',
              amountCents: 150000,
              receivedAmountCents: 200000,
              changeAmountCents: 100000,
              reference: 'REC-001',
            },
          ],
        });
      expect(resChange.status).toBe(409);

      // 3. Altered reference
      const resRef = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          ...payload,
          tenders: [
            {
              type: 'CASH',
              amountCents: 150000,
              receivedAmountCents: 200000,
              changeAmountCents: 50000,
              reference: 'REC-ALTERED',
            },
          ],
        });
      expect(resRef.status).toBe(409);
    });
  });

  describe('Integration Test Suite Discovery Diagnostic', () => {
    it('discovers all required integration test suites (sales, catalog, auth, multitenancy, sales.service, seed)', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const testDir = path.resolve(__dirname);
      const files = fs.readdirSync(testDir);
      const integrationSuites = files.filter((f) => f.endsWith('.integration.test.ts'));

      expect(integrationSuites).toContain('sales.integration.test.ts');
      expect(integrationSuites).toContain('catalog.integration.test.ts');
      expect(integrationSuites).toContain('auth.integration.test.ts');
      expect(integrationSuites).toContain('multitenancy.integration.test.ts');
      expect(integrationSuites).toContain('sales.service.integration.test.ts');
      expect(integrationSuites).toContain('seed.integration.test.ts');
      expect(integrationSuites.length).toBeGreaterThanOrEqual(6);
    });
  });
});
