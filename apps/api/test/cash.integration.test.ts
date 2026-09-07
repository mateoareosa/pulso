import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { RateLimiterService } from '../src/auth/rate-limiter.service.js';
import { hashPassword } from '../src/auth/security.utils.js';

function extractCookieValue(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = cookies.find((c) => c.startsWith('pulso_session='));
  if (typeof found !== 'string') throw new Error('Expected pulso_session cookie was not found');
  const part = found.split(';')[0];
  return part ?? '';
}

describe('Cash, Shifts & Cash Audit Integration Suite (PostgreSQL Real)', () => {
  let app: INestApplication;
  let ownerCookieA: string;
  let cashierCookieA: string;
  let ownerCookieB: string;
  let tenantAId: string;
  let locationAId: string;
  let productA1Id: string;

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
      businessName: 'Kiosco Central A',
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

    // Create Product in Tenant A
    const p1 = await request(app.getHttpServer())
      .post('/api/products')
      .set('Cookie', ownerCookieA)
      .send({
        name: 'Alfajor Triple',
        barcode: '7791234567890',
        salePriceCents: 150000,
        unit: 'UNIT',
        initialStock: '100.0000',
      });
    expect(p1.status).toBe(201);
    productA1Id = p1.body.id;
  });

  describe('Authentication and Permissions', () => {
    it('returns 401 when calling cash endpoints without a session cookie', async () => {
      const resActive = await request(app.getHttpServer()).get('/api/cash/active');
      expect(resActive.status).toBe(401);

      const resOpen = await request(app.getHttpServer()).post('/api/cash/shifts/open').send({
        openingAmountCents: 100000,
        idempotencyKey: '00000000-0000-4000-8000-000000000001',
      });
      expect(resOpen.status).toBe(401);

      const resShifts = await request(app.getHttpServer()).get('/api/cash/shifts');
      expect(resShifts.status).toBe(401);
    });

    it('allows CASHIER to get active shift, open, register movements, and close', async () => {
      // 1. Get active shift (returns null initially)
      const res1 = await request(app.getHttpServer())
        .get('/api/cash/active')
        .set('Cookie', cashierCookieA);
      expect(res1.status).toBe(200);
      expect(res1.body?.id).toBeUndefined();

      // 2. Open shift
      const resOpen = await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 500000,
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
        });
      expect(resOpen.status).toBe(200);
      expect(resOpen.body.success).toBe(true);
      expect(resOpen.body.shift.status).toBe('OPEN');
      expect(resOpen.body.shift.openingAmountCents).toBe(500000);

      // 3. Register Cash In
      const resIn = await request(app.getHttpServer())
        .post('/api/cash/movements/in')
        .set('Cookie', cashierCookieA)
        .send({
          amountCents: 200000,
          reason: 'Ingreso para cambio de billetes chicos',
          idempotencyKey: '22222222-2222-4222-8222-222222222222',
        });
      expect(resIn.status).toBe(200);
      expect(resIn.body.movement.type).toBe('CASH_IN');

      // 4. Register Cash Out
      const resOut = await request(app.getHttpServer())
        .post('/api/cash/movements/out')
        .set('Cookie', cashierCookieA)
        .send({
          amountCents: 100000,
          reason: 'Pago a fletero de gaseosas',
          idempotencyKey: '33333333-3333-4333-8333-333333333333',
        });
      expect(resOut.status).toBe(200);
      expect(resOut.body.movement.type).toBe('CASH_OUT');

      // 5. Close shift
      const resClose = await request(app.getHttpServer())
        .post('/api/cash/shifts/close')
        .set('Cookie', cashierCookieA)
        .send({
          countedAmountCents: 600000,
          idempotencyKey: '44444444-4444-4444-8444-444444444444',
        });
      expect(resClose.status).toBe(200);
      expect(resClose.body.shift.status).toBe('CLOSED');
      expect(resClose.body.shift.expectedAmountCents).toBe(600000);
      expect(resClose.body.shift.differenceAmountCents).toBe(0);
    });

    it('forbids CASHIER from querying shift history list (GET /api/cash/shifts) with 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cash/shifts')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Permisos insuficientes');
    });

    it('allows OWNER and MANAGER to query shift history list with pagination and filters', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/cash/shifts?page=1&limit=10')
        .set('Cookie', ownerCookieA);
      expect(res.status).toBe(200);
      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.total).toBeDefined();
    });
  });

  describe('Shift Opening & Unique Open Shift Invariant', () => {
    it('creates OPENING cash movement atomically upon opening shift', async () => {
      const resOpen = await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 250000,
          idempotencyKey: '55555555-5555-4555-8555-555555555555',
        });
      expect(resOpen.status).toBe(200);
      const shiftId = resOpen.body.shift.id;

      const movements = await testPrisma.cashMovement.findMany({
        where: { shiftId },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]?.type).toBe('OPENING');
      expect(movements[0]?.amountCents).toBe(250000);
      expect(movements[0]?.signedAmountCents).toBe(250000);
      expect(movements[0]?.reason).toBe('Fondo inicial de caja');
    });

    it('rejects a second open shift request with 409 Conflict when a shift is already open', async () => {
      // 1. First open: succeeds
      await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 100000,
          idempotencyKey: '66666666-6666-4666-8666-666666666661',
        });

      // 2. Second open: rejected
      const resSecond = await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 200000,
          idempotencyKey: '66666666-6666-4666-8666-666666666662',
        });
      expect(resSecond.status).toBe(409);
      expect(resSecond.body.message).toContain('Ya existe un turno de caja abierto');
    });

    it('handles concurrent shift openings with Promise.all: exactly one succeeds, the other fails with 409', async () => {
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA)
          .send({
            openingAmountCents: 100000,
            idempotencyKey: '77777777-7777-4777-8777-777777777771',
          }),
        request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', ownerCookieA)
          .send({
            openingAmountCents: 150000,
            idempotencyKey: '77777777-7777-4777-8777-777777777772',
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);

      // Verify at the database level only 1 open shift exists
      const openShifts = await testPrisma.cashShift.findMany({
        where: { tenantId: tenantAId, locationId: locationAId, status: 'OPEN' },
      });
      expect(openShifts).toHaveLength(1);
    });

    it('returns idempotent replay when opening shift with same idempotencyKey and same payload', async () => {
      const idempotencyKey = '88888888-8888-4888-8888-888888888888';
      const payload = {
        openingAmountCents: 300000,
        idempotencyKey,
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send(payload);
      expect(res1.status).toBe(200);
      expect(res1.body.idempotentReplay).toBe(false);

      const res2 = await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.idempotentReplay).toBe(true);
      expect(res2.body.shift.id).toBe(res1.body.shift.id);

      // Verify only 1 movement and 1 shift exist
      const count = await testPrisma.cashShift.count({ where: { tenantId: tenantAId } });
      expect(count).toBe(1);
    });
  });

  describe('Manual Movements, Overdraft Prevention & Calculations', () => {
    beforeEach(async () => {
      // Open initial shift with $1000.00 (100000 cents)
      await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 100000,
          idempotencyKey: 'aaaa0000-0000-4000-8000-000000000000',
        });
    });

    it('computes expected cash balance correctly: initial + in - out', async () => {
      // Cash In: +$500.00 (50000 cents)
      await request(app.getHttpServer())
        .post('/api/cash/movements/in')
        .set('Cookie', cashierCookieA)
        .send({
          amountCents: 50000,
          reason: 'Reposición de cambio',
          idempotencyKey: 'aaaa1111-1111-4111-8111-111111111111',
        });

      // Cash Out: -$200.00 (20000 cents)
      const resOut = await request(app.getHttpServer())
        .post('/api/cash/movements/out')
        .set('Cookie', cashierCookieA)
        .send({
          amountCents: 20000,
          reason: 'Compra de artículos de limpieza',
          idempotencyKey: 'aaaa2222-2222-4222-8222-222222222222',
        });

      expect(resOut.status).toBe(200);
      // Expected = 100000 + 50000 - 20000 = 130000 ($1300.00)
      expect(resOut.body.shift.summary.expectedAmountCents).toBe(130000);
      expect(resOut.body.shift.summary.cashInAmountCents).toBe(50000);
      expect(resOut.body.shift.summary.cashOutAmountCents).toBe(20000);
    });

    it('rejects a cash withdrawal that would cause negative expected cash balance with 400 Bad Request', async () => {
      // Current balance is 100000. Attempt withdrawal of 100001
      const res = await request(app.getHttpServer())
        .post('/api/cash/movements/out')
        .set('Cookie', cashierCookieA)
        .send({
          amountCents: 100001,
          reason: 'Retiro excesivo',
          idempotencyKey: 'aaaa3333-3333-4333-8333-333333333333',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Saldo insuficiente en caja');

      // Verify no movement was saved
      const movement = await testPrisma.cashMovement.findFirst({
        where: { idempotencyKey: 'aaaa3333-3333-4333-8333-333333333333' },
      });
      expect(movement).toBeNull();
    });

    it('rejects movements on closed shifts', async () => {
      // Close the shift
      await request(app.getHttpServer())
        .post('/api/cash/shifts/close')
        .set('Cookie', cashierCookieA)
        .send({
          countedAmountCents: 100000,
          idempotencyKey: 'aaaa4444-4444-4444-8444-444444444444',
        });

      // Try cash in on closed shift
      const res = await request(app.getHttpServer())
        .post('/api/cash/movements/in')
        .set('Cookie', cashierCookieA)
        .send({
          amountCents: 10000,
          reason: 'Intento con turno cerrado',
          idempotencyKey: 'aaaa5555-5555-4555-8555-555555555555',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('No hay un turno de caja abierto');
    });
  });

  describe('Sales Integration & Atomic Cash Ledger Impact', () => {
    it('rejects a sale when there is no open shift with 400 Bad Request', async () => {
      // Ensure no shift is open
      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'bbbb1111-1111-4111-8111-111111111111',
          items: [
            {
              productId: productA1Id,
              name: 'Alfajor Triple',
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
      expect(res.body.message).toContain('No hay un turno de caja abierto en esta sucursal');
    });

    it('records sale cash tender in cash ledger exactly once and links to active shift', async () => {
      // 1. Open shift with $1000.00
      const openRes = await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 100000,
          idempotencyKey: 'bbbb0000-0000-4000-8000-000000000000',
        });
      const shiftId = openRes.body.shift.id;

      // 2. Perform sale: Total $3000.00. Client pays with $5000.00 cash, change $2000.00. Net impact: +$3000.00
      const saleRes = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'bbbb2222-2222-4222-8222-222222222222',
          items: [
            {
              productId: productA1Id,
              name: 'Alfajor Triple',
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
        });

      expect(saleRes.status).toBe(200);
      const saleId = saleRes.body.sale.id;

      // 3. Verify CashMovement of type SALE was created
      const movements = await testPrisma.cashMovement.findMany({
        where: { shiftId, type: 'SALE' },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]?.saleId).toBe(saleId);
      expect(movements[0]?.amountCents).toBe(300000); // Net $3000.00, NOT the $5000.00 received!
      expect(movements[0]?.signedAmountCents).toBe(300000);

      // 4. Check active shift summary: Expected is 100000 + 300000 = 400000 ($4000.00)
      const activeRes = await request(app.getHttpServer())
        .get('/api/cash/active')
        .set('Cookie', cashierCookieA);
      expect(activeRes.body.summary.expectedAmountCents).toBe(400000);
      expect(activeRes.body.summary.cashSalesAmountCents).toBe(300000);
      expect(activeRes.body.summary.salesCount).toBe(1);
    });

    it('does not duplicate cash movement on idempotent sale replay', async () => {
      await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 100000,
          idempotencyKey: 'bbbb3333-3333-4333-8333-333333333330',
        });

      const salePayload = {
        idempotencyKey: 'bbbb3333-3333-4333-8333-333333333333',
        items: [
          {
            productId: productA1Id,
            name: 'Alfajor Triple',
            quantity: 1,
            unitPriceCents: 150000,
            totalPriceCents: 150000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 150000 }],
        totalCents: 150000,
        createdAtUtc: new Date().toISOString(),
      };

      // Request 1
      const res1 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(salePayload);
      expect(res1.body.idempotentReplay).toBe(false);

      // Request 2 (Replay)
      const res2 = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send(salePayload);
      expect(res2.body.idempotentReplay).toBe(true);

      // Verify movements: strictly 1 OPENING and 1 SALE
      const saleMovements = await testPrisma.cashMovement.findMany({
        where: { type: 'SALE' },
      });
      expect(saleMovements).toHaveLength(1);
    });

    it('does not record a cash movement for sales paid entirely with non-cash tenders', async () => {
      await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 100000,
          idempotencyKey: 'bbbb4444-4444-4444-8444-444444444440',
        });

      await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', cashierCookieA)
        .send({
          idempotencyKey: 'bbbb4444-4444-4444-8444-444444444444',
          items: [
            {
              productId: productA1Id,
              name: 'Alfajor Triple',
              quantity: 1,
              unitPriceCents: 150000,
              totalPriceCents: 150000,
            },
          ],
          tenders: [{ type: 'DEBIT', amountCents: 150000 }],
          totalCents: 150000,
          createdAtUtc: new Date().toISOString(),
        });

      // No SALE cash movement created
      const saleMovements = await testPrisma.cashMovement.findMany({
        where: { type: 'SALE' },
      });
      expect(saleMovements).toHaveLength(0);

      // Expected cash remains 100000
      const active = await request(app.getHttpServer())
        .get('/api/cash/active')
        .set('Cookie', cashierCookieA);
      expect(active.body.summary.expectedAmountCents).toBe(100000);
      expect(active.body.summary.cashSalesAmountCents).toBe(0);
    });
  });

  describe('Shift Closing & Difference Calculation', () => {
    beforeEach(async () => {
      // Open with $1000.00
      await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', cashierCookieA)
        .send({
          openingAmountCents: 100000,
          idempotencyKey: 'cccc0000-0000-4000-8000-000000000000',
        });

      // Cash in $200.00
      await request(app.getHttpServer())
        .post('/api/cash/movements/in')
        .set('Cookie', cashierCookieA)
        .send({
          amountCents: 20000,
          reason: 'Cambio',
          idempotencyKey: 'cccc1111-1111-4111-8111-111111111111',
        });

      // Expected = 120000 ($1200.00)
    });

    it('closes with exact balance when counted === expected', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/cash/shifts/close')
        .set('Cookie', cashierCookieA)
        .send({
          countedAmountCents: 120000,
          idempotencyKey: 'cccc2222-2222-4222-8222-222222222222',
        });

      expect(res.status).toBe(200);
      expect(res.body.shift.status).toBe('CLOSED');
      expect(res.body.shift.expectedAmountCents).toBe(120000);
      expect(res.body.shift.countedAmountCents).toBe(120000);
      expect(res.body.shift.differenceAmountCents).toBe(0);
    });

    it('closes with positive difference (sobrante) when counted > expected', async () => {
      // Counted $1250.00 vs expected $1200.00 -> Sobrante: +$50.00 (5000 cents)
      const res = await request(app.getHttpServer())
        .post('/api/cash/shifts/close')
        .set('Cookie', cashierCookieA)
        .send({
          countedAmountCents: 125000,
          idempotencyKey: 'cccc3333-3333-4333-8333-333333333333',
        });

      expect(res.status).toBe(200);
      expect(res.body.shift.differenceAmountCents).toBe(5000);
    });

    it('closes with negative difference (faltante) when counted < expected', async () => {
      // Counted $1100.00 vs expected $1200.00 -> Faltante: -$100.00 (-10000 cents)
      const res = await request(app.getHttpServer())
        .post('/api/cash/shifts/close')
        .set('Cookie', cashierCookieA)
        .send({
          countedAmountCents: 110000,
          idempotencyKey: 'cccc4444-4444-4444-8444-444444444444',
        });

      expect(res.status).toBe(200);
      expect(res.body.shift.differenceAmountCents).toBe(-10000);
    });

    it('rejects closing a shift when no shift is open', async () => {
      // First close succeeds
      await request(app.getHttpServer())
        .post('/api/cash/shifts/close')
        .set('Cookie', cashierCookieA)
        .send({
          countedAmountCents: 120000,
          idempotencyKey: 'cccc5555-5555-4555-8555-555555555551',
        });

      // Second close fails
      const res = await request(app.getHttpServer())
        .post('/api/cash/shifts/close')
        .set('Cookie', cashierCookieA)
        .send({
          countedAmountCents: 120000,
          idempotencyKey: 'cccc5555-5555-4555-8555-555555555552',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('No hay un turno de caja abierto');
    });

    it('handles concurrent closures with Promise.all: exactly one succeeds, second gets conflict or replay', async () => {
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post('/api/cash/shifts/close')
          .set('Cookie', cashierCookieA)
          .send({
            countedAmountCents: 120000,
            idempotencyKey: 'cccc6666-6666-4666-8666-666666666661',
          }),
        request(app.getHttpServer())
          .post('/api/cash/shifts/close')
          .set('Cookie', ownerCookieA)
          .send({
            countedAmountCents: 120000,
            idempotencyKey: 'cccc6666-6666-4666-8666-666666666662',
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 400]);

      // Exactly 1 shift is CLOSED
      const closedShifts = await testPrisma.cashShift.findMany({
        where: { tenantId: tenantAId, locationId: locationAId, status: 'CLOSED' },
      });
      expect(closedShifts).toHaveLength(1);
    });
  });

  describe('Multi-Tenant & Multi-Location Isolation', () => {
    it('isolates cash shifts and movements between tenants completely', async () => {
      // Tenant A opens shift with 500000
      const openA = await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', ownerCookieA)
        .send({
          openingAmountCents: 500000,
          idempotencyKey: 'dddd1111-1111-4111-8111-111111111111',
        });
      expect(openA.status).toBe(200);
      const shiftAId = openA.body.shift.id;

      // Tenant B queries active shift: must be null
      const activeB = await request(app.getHttpServer())
        .get('/api/cash/active')
        .set('Cookie', ownerCookieB);
      expect(activeB.status).toBe(200);
      expect(activeB.body?.id).toBeUndefined();

      // Tenant B attempts to fetch Tenant A's shift by ID: must return 404 Not Found
      const resB = await request(app.getHttpServer())
        .get(`/api/cash/shifts/${shiftAId}`)
        .set('Cookie', ownerCookieB);
      expect(resB.status).toBe(404);
    });

    describe('2.A Venta concurrente con cierre (PostgreSQL real, determinista)', () => {
      it('executes concurrent sale and shift closing: exactly one defined outcome occurs, never inconsistent or partial state', async () => {
        // 1. Open shift with $1000.00 (100000 cents)
        const openRes = await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA)
          .send({
            openingAmountCents: 100000,
            idempotencyKey: 'aaaa0001-0000-4000-8000-000000000001',
          });
        expect(openRes.status).toBe(200);
        const shiftId = openRes.body.shift.id;

        // Ensure product stock is set to exactly 10
        await testPrisma.productLocation.update({
          where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
          data: { stockQuantity: 10 },
        });

        const saleIdemKey = 'aaaa0002-0000-4000-8000-000000000002';
        const closeIdemKey = 'aaaa0003-0000-4000-8000-000000000003';

        // 2. Launch sale ($500.00 cash) and shift close simultaneously
        const [saleRes, closeRes] = await Promise.all([
          request(app.getHttpServer())
            .post('/api/sales')
            .set('Cookie', cashierCookieA)
            .send({
              idempotencyKey: saleIdemKey,
              shiftId,
              items: [
                {
                  productId: productA1Id,
                  name: 'Alfajor Triple',
                  quantity: 1,
                  unitPriceCents: 50000,
                  totalPriceCents: 50000,
                },
              ],
              tenders: [{ type: 'CASH', amountCents: 50000 }],
              totalCents: 50000,
              createdAtUtc: new Date().toISOString(),
            }),
          request(app.getHttpServer())
            .post('/api/cash/shifts/close')
            .set('Cookie', ownerCookieA)
            .send({
              countedAmountCents: 150000,
              idempotencyKey: closeIdemKey,
            }),
        ]);

        // Close must always succeed (status 200)
        expect(closeRes.status).toBe(200);
        expect(closeRes.body.shift.status).toBe('CLOSED');

        if (saleRes.status === 200) {
          // CASE 1: Sale won the race before shift closure committed
          // The sale must be included in the closing expected amount!
          expect(closeRes.body.shift.expectedAmountCents).toBe(150000); // 100000 float + 50000 cash sale
          expect(closeRes.body.shift.differenceAmountCents).toBe(0); // 150000 counted - 150000 expected

          // Sale and CashMovement exist in database
          const savedSale = await testPrisma.sale.findUnique({
            where: {
              tenantId_idempotencyKey: { tenantId: tenantAId, idempotencyKey: saleIdemKey },
            },
          });
          expect(savedSale).not.toBeNull();
          expect(savedSale?.shiftId).toBe(shiftId);

          const movements = await testPrisma.cashMovement.findMany({
            where: { shiftId, type: 'SALE' },
          });
          expect(movements).toHaveLength(1);
          expect(movements[0]?.amountCents).toBe(50000);

          // Stock was decremented from 10 to 9
          const stockRecord = await testPrisma.productLocation.findUnique({
            where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
          });
          expect(Number(stockRecord?.stockQuantity)).toBe(9);
        } else {
          // CASE 2: Close won the race and closed the shift first
          // The sale was rejected because the shift was already closed!
          expect(saleRes.status).toBe(400);
          expect(saleRes.body.message).toContain('No hay un turno de caja abierto');

          // Close expected amount did not include the rejected sale
          expect(closeRes.body.shift.expectedAmountCents).toBe(100000);

          // Sale, CashMovement, and stock decrement were NOT persisted
          const savedSale = await testPrisma.sale.findUnique({
            where: {
              tenantId_idempotencyKey: { tenantId: tenantAId, idempotencyKey: saleIdemKey },
            },
          });
          expect(savedSale).toBeNull();

          const movements = await testPrisma.cashMovement.findMany({
            where: { shiftId, type: 'SALE' },
          });
          expect(movements).toHaveLength(0);

          // Stock remains untouched at 10
          const stockRecord = await testPrisma.productLocation.findUnique({
            where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
          });
          expect(Number(stockRecord?.stockQuantity)).toBe(10);
        }
      });
    });

    describe('2.B Retiro concurrente con saldo límite', () => {
      it('executes two concurrent withdrawals that exceed balance together: exactly one succeeds, final cash never negative', async () => {
        // 1. Open shift with $1000.00 (100000 cents)
        await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA)
          .send({
            openingAmountCents: 100000,
            idempotencyKey: 'bbbb0001-0000-4000-8000-000000000001',
          });

        // 2. Launch two concurrent withdrawals of $600.00 (60000 cents) each.
        // Individually each is <= 100000, but sum (120000) > 100000.
        const [res1, res2] = await Promise.all([
          request(app.getHttpServer())
            .post('/api/cash/movements/out')
            .set('Cookie', cashierCookieA)
            .send({
              amountCents: 60000,
              reason: 'Retiro concurrente A',
              idempotencyKey: 'bbbb0002-0000-4000-8000-000000000002',
            }),
          request(app.getHttpServer())
            .post('/api/cash/movements/out')
            .set('Cookie', cashierCookieA)
            .send({
              amountCents: 60000,
              reason: 'Retiro concurrente B',
              idempotencyKey: 'bbbb0003-0000-4000-8000-000000000003',
            }),
        ]);

        const statuses = [res1.status, res2.status].sort();
        expect(statuses).toEqual([200, 400]);

        const failedRes = res1.status === 400 ? res1 : res2;
        expect(failedRes.body.message).toContain('Saldo insuficiente en caja');

        // 3. Verify exactly 1 CASH_OUT movement exists in database
        const outMovements = await testPrisma.cashMovement.findMany({
          where: { tenantId: tenantAId, locationId: locationAId, type: 'CASH_OUT' },
        });
        expect(outMovements).toHaveLength(1);
        expect(outMovements[0]?.amountCents).toBe(60000);

        // 4. Verify active shift expected balance is strictly 40000 cents ($400.00), never negative
        const activeRes = await request(app.getHttpServer())
          .get('/api/cash/active')
          .set('Cookie', cashierCookieA);
        expect(activeRes.status).toBe(200);
        expect(activeRes.body.summary.expectedAmountCents).toBe(40000);
        expect(activeRes.body.summary.cashOutAmountCents).toBe(60000);
      });
    });

    describe('2.C Idempotencia de caja con payload diferente', () => {
      it('returns 200 replay on same payload and 409 Conflict on altered payload across open, in, out, close', async () => {
        // 1. Apertura: same payload -> replay, different amount -> 409
        const openKey = 'cccc0001-0000-4000-8000-000000000001';
        const open1 = await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA)
          .send({ openingAmountCents: 500000, idempotencyKey: openKey });
        expect(open1.status).toBe(200);
        expect(open1.body.idempotentReplay).toBe(false);

        const openReplay = await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA)
          .send({ openingAmountCents: 500000, idempotencyKey: openKey });
        expect(openReplay.status).toBe(200);
        expect(openReplay.body.idempotentReplay).toBe(true);

        const openDiff = await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA)
          .send({ openingAmountCents: 600000, idempotencyKey: openKey });
        expect(openDiff.status).toBe(409);
        expect(openDiff.body.message).toContain(
          'ya fue utilizada con una operación o monto diferente'
        );

        // 2. Ingreso: same payload -> replay, different amount -> 409, different reason -> 409
        const inKey = 'cccc0002-0000-4000-8000-000000000002';
        const in1 = await request(app.getHttpServer())
          .post('/api/cash/movements/in')
          .set('Cookie', cashierCookieA)
          .send({ amountCents: 20000, reason: 'Cambio inicial', idempotencyKey: inKey });
        expect(in1.status).toBe(200);
        expect(in1.body.idempotentReplay).toBe(false);

        const inReplay = await request(app.getHttpServer())
          .post('/api/cash/movements/in')
          .set('Cookie', cashierCookieA)
          .send({ amountCents: 20000, reason: 'Cambio inicial', idempotencyKey: inKey });
        expect(inReplay.status).toBe(200);
        expect(inReplay.body.idempotentReplay).toBe(true);

        const inDiffAmount = await request(app.getHttpServer())
          .post('/api/cash/movements/in')
          .set('Cookie', cashierCookieA)
          .send({ amountCents: 30000, reason: 'Cambio inicial', idempotencyKey: inKey });
        expect(inDiffAmount.status).toBe(409);

        const inDiffReason = await request(app.getHttpServer())
          .post('/api/cash/movements/in')
          .set('Cookie', cashierCookieA)
          .send({ amountCents: 20000, reason: 'Motivo modificado', idempotencyKey: inKey });
        expect(inDiffReason.status).toBe(409);

        // 3. Retiro: same payload -> replay, different amount -> 409, different reason -> 409
        const outKey = 'cccc0003-0000-4000-8000-000000000003';
        const out1 = await request(app.getHttpServer())
          .post('/api/cash/movements/out')
          .set('Cookie', cashierCookieA)
          .send({ amountCents: 10000, reason: 'Pago de flete', idempotencyKey: outKey });
        expect(out1.status).toBe(200);
        expect(out1.body.idempotentReplay).toBe(false);

        const outReplay = await request(app.getHttpServer())
          .post('/api/cash/movements/out')
          .set('Cookie', cashierCookieA)
          .send({ amountCents: 10000, reason: 'Pago de flete', idempotencyKey: outKey });
        expect(outReplay.status).toBe(200);
        expect(outReplay.body.idempotentReplay).toBe(true);

        const outDiffAmount = await request(app.getHttpServer())
          .post('/api/cash/movements/out')
          .set('Cookie', cashierCookieA)
          .send({ amountCents: 15000, reason: 'Pago de flete', idempotencyKey: outKey });
        expect(outDiffAmount.status).toBe(409);

        const outDiffReason = await request(app.getHttpServer())
          .post('/api/cash/movements/out')
          .set('Cookie', cashierCookieA)
          .send({ amountCents: 10000, reason: 'Otro concepto', idempotencyKey: outKey });
        expect(outDiffReason.status).toBe(409);

        // 4. Cierre: expected is 500000 + 20000 - 10000 = 510000
        const closeKey = 'cccc0004-0000-4000-8000-000000000004';
        const close1 = await request(app.getHttpServer())
          .post('/api/cash/shifts/close')
          .set('Cookie', cashierCookieA)
          .send({ countedAmountCents: 510000, idempotencyKey: closeKey });
        expect(close1.status).toBe(200);
        expect(close1.body.idempotentReplay).toBe(false);

        const closeReplay = await request(app.getHttpServer())
          .post('/api/cash/shifts/close')
          .set('Cookie', cashierCookieA)
          .send({ countedAmountCents: 510000, idempotencyKey: closeKey });
        expect(closeReplay.status).toBe(200);
        expect(closeReplay.body.idempotentReplay).toBe(true);

        const closeDiffCounted = await request(app.getHttpServer())
          .post('/api/cash/shifts/close')
          .set('Cookie', cashierCookieA)
          .send({ countedAmountCents: 999999, idempotencyKey: closeKey });
        expect(closeDiffCounted.status).toBe(409);
        expect(closeDiffCounted.body.message).toContain('con un conteo o cierre diferente');
      });
    });

    describe('2.D Sincronización offline repetida', () => {
      it('processes repeated sync batch idempotently without duplicate sale, cash movement, or stock impact', async () => {
        // 1. Open shift with $1000.00
        const openRes = await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA)
          .send({
            openingAmountCents: 100000,
            idempotencyKey: 'dddd0001-0000-4000-8000-000000000001',
          });
        expect(openRes.status).toBe(200);
        const shiftId = openRes.body.shift.id;

        // Ensure stock is exactly 10
        await testPrisma.productLocation.update({
          where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
          data: { stockQuantity: 10 },
        });

        const offlineSalePayload = {
          deviceId: 'pos-term-cash-1',
          operations: [
            {
              operationId: 'dddd0001-0000-4000-8000-000000000001',
              type: 'CREATE_SALE',
              payload: {
                shiftId,
                idempotencyKey: 'dddd0002-0000-4000-8000-000000000002',
                items: [
                  {
                    productId: productA1Id,
                    name: 'Alfajor Triple',
                    quantity: 2,
                    unitPriceCents: 150000,
                    totalPriceCents: 300000,
                  },
                ],
                tenders: [{ type: 'CASH', amountCents: 300000 }],
                totalCents: 300000,
                createdAtUtc: new Date().toISOString(),
              },
            },
          ],
        };

        // 2. First Sync
        const sync1 = await request(app.getHttpServer())
          .post('/api/sync/batch')
          .set('Cookie', cashierCookieA)
          .send(offlineSalePayload);
        expect(sync1.status).toBe(200);
        expect(sync1.body.syncedCount).toBe(1);
        expect(sync1.body.results[0]?.status).toBe('SYNCED');
        expect(sync1.body.results[0]?.idempotentReplay).toBe(false);

        // 3. Repeat EXACT Sync (Replay)
        const sync2 = await request(app.getHttpServer())
          .post('/api/sync/batch')
          .set('Cookie', cashierCookieA)
          .send(offlineSalePayload);
        expect(sync2.status).toBe(200);
        expect(sync2.body.syncedCount).toBe(1);
        expect(sync2.body.results[0]?.status).toBe('SYNCED');
        expect(sync2.body.results[0]?.idempotentReplay).toBe(true);

        // 4. Invariants check in database:
        // Exactly 1 Sale record
        const salesCount = await testPrisma.sale.count({
          where: { tenantId: tenantAId, idempotencyKey: 'dddd0002-0000-4000-8000-000000000002' },
        });
        expect(salesCount).toBe(1);

        // Exactly 1 CashMovement of type SALE
        const movements = await testPrisma.cashMovement.findMany({
          where: { shiftId, type: 'SALE' },
        });
        expect(movements).toHaveLength(1);
        expect(movements[0]?.amountCents).toBe(300000);

        // Stock decremented by 2 only once (10 - 2 = 8, NOT 6)
        const stock = await testPrisma.productLocation.findUnique({
          where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
        });
        expect(Number(stock?.stockQuantity)).toBe(8);

        // Active shift expected balance: 100000 + 300000 = 400000 ($4000.00, NOT $7000.00)
        const activeRes = await request(app.getHttpServer())
          .get('/api/cash/active')
          .set('Cookie', cashierCookieA);
        expect(activeRes.status).toBe(200);
        expect(activeRes.body.summary.expectedAmountCents).toBe(400000);
        expect(activeRes.body.summary.salesCount).toBe(1);
      });
    });

    describe('2.E Aislamiento entre locations del mismo tenant', () => {
      it('isolates active shift, opening, closing, and history between locations within the same tenant', async () => {
        // Create Location 2 in Tenant A
        const loc2 = await testPrisma.location.create({
          data: {
            tenantId: tenantAId,
            name: 'Sucursal Oeste',
            isActive: true,
          },
        });
        const locationA2Id = loc2.id;

        // Create session for cashier in Location 2
        const cashierUser = await testPrisma.user.findFirstOrThrow({
          where: { email: 'cajero.a@pulso.dev' },
        });
        const tokenCashierLoc2 = 'test-token-cashier-loc2-session';
        await testPrisma.session.create({
          data: {
            userId: cashierUser.id,
            tenantId: tenantAId,
            locationId: locationA2Id,
            tokenHash: createHash('sha256').update(tokenCashierLoc2).digest('hex'),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const cashierCookieA_Loc2 = `pulso_session=${tokenCashierLoc2}`;

        // Create session for owner in Location 2
        const ownerUser = await testPrisma.user.findFirstOrThrow({
          where: { email: 'dueno.a@pulso.dev' },
        });
        const tokenOwnerLoc2 = 'test-token-owner-loc2-session';
        await testPrisma.session.create({
          data: {
            userId: ownerUser.id,
            tenantId: tenantAId,
            locationId: locationA2Id,
            tokenHash: createHash('sha256').update(tokenOwnerLoc2).digest('hex'),
            expiresAt: new Date(Date.now() + 86400000),
          },
        });
        const ownerCookieA_Loc2 = `pulso_session=${tokenOwnerLoc2}`;

        // 1. Open shift in Location A (Sucursal Centro) with $1000.00
        const openLoc1 = await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA)
          .send({
            openingAmountCents: 100000,
            idempotencyKey: 'eeee0001-0000-4000-8000-000000000001',
          });
        expect(openLoc1.status).toBe(200);
        const shiftLoc1Id = openLoc1.body.shift.id;

        // 2. Query active shift from Location 2 session: must return null!
        const activeLoc2 = await request(app.getHttpServer())
          .get('/api/cash/active')
          .set('Cookie', cashierCookieA_Loc2);
        expect(activeLoc2.status).toBe(200);
        expect(activeLoc2.body?.id).toBeUndefined();

        // 3. Open shift in Location 2 with $2500.00: must SUCCEED!
        // (The open shift in Location 1 does NOT block opening in Location 2!)
        const openLoc2 = await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA_Loc2)
          .send({
            openingAmountCents: 250000,
            idempotencyKey: 'eeee0002-0000-4000-8000-000000000002',
          });
        expect(openLoc2.status).toBe(200);
        const shiftLoc2Id = openLoc2.body.shift.id;
        expect(shiftLoc2Id).not.toBe(shiftLoc1Id);

        // 4. Verify Location 2 now sees its own active shift
        const activeLoc2After = await request(app.getHttpServer())
          .get('/api/cash/active')
          .set('Cookie', cashierCookieA_Loc2);
        expect(activeLoc2After.body.id).toBe(shiftLoc2Id);
        expect(activeLoc2After.body.openingAmountCents).toBe(250000);

        // 5. User from Location 2 cannot fetch Location 1's shift by ID: returns 404
        const getShift1FromLoc2 = await request(app.getHttpServer())
          .get(`/api/cash/shifts/${shiftLoc1Id}`)
          .set('Cookie', cashierCookieA_Loc2);
        expect(getShift1FromLoc2.status).toBe(404);

        // 6. User from Location 2 cannot reuse idempotency key used in Location 1: returns 409
        const crossIdemRes = await request(app.getHttpServer())
          .post('/api/cash/shifts/open')
          .set('Cookie', cashierCookieA_Loc2)
          .send({
            openingAmountCents: 100000,
            idempotencyKey: 'eeee0001-0000-4000-8000-000000000001',
          });
        expect(crossIdemRes.status).toBe(409);
        expect(crossIdemRes.body.message).toContain('otra sucursal');

        // 7. History queries are strictly filtered by location:
        // Owner in Location 1 sees Location 1 shift
        const historyLoc1 = await request(app.getHttpServer())
          .get('/api/cash/shifts')
          .set('Cookie', ownerCookieA);
        expect(historyLoc1.status).toBe(200);
        const loc1ShiftIds = historyLoc1.body.items.map((s: { id: string }) => s.id);
        expect(loc1ShiftIds).toContain(shiftLoc1Id);
        expect(loc1ShiftIds).not.toContain(shiftLoc2Id);

        // Owner in Location 2 sees Location 2 shift
        const historyLoc2 = await request(app.getHttpServer())
          .get('/api/cash/shifts')
          .set('Cookie', ownerCookieA_Loc2);
        expect(historyLoc2.status).toBe(200);
        const loc2ShiftIds = historyLoc2.body.items.map((s: { id: string }) => s.id);
        expect(loc2ShiftIds).toContain(shiftLoc2Id);
        expect(loc2ShiftIds).not.toContain(shiftLoc1Id);
      });
    });
  });
});
