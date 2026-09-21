import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { RateLimiterService } from '../src/auth/rate-limiter.service.js';
import { hashPassword } from '../src/auth/security.utils.js';
import { SessionService } from '../src/auth/session.service.js';

function extractCookieValue(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = cookies.find((c) => c.startsWith('pulso_session='));
  if (typeof found !== 'string') throw new Error('Expected pulso_session cookie was not found');
  const part = found.split(';')[0];
  return part ?? '';
}

describe('Suppliers & Purchases Integration Suite (PostgreSQL Real)', () => {
  let app: INestApplication;
  let ownerCookieA: string;
  let cashierCookieA: string;
  let ownerCookieB: string;
  let ownerCookieAOtherLocation: string;
  let tenantAId: string;
  let locationAId: string;
  let ownerAUserId: string;
  let productA1Id: string;
  let productA2Id: string;

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
    ownerAUserId = regA.body.user.id;

    // Create Cashier in Tenant A
    const cashierUser = await testPrisma.user.create({
      data: {
        email: 'cajero.a@pulso.dev',
        normalizedEmail: 'cajero.a@pulso.dev',
        name: 'Cajero A',
        passwordHash: await hashPassword('CashierPass123!'),
      },
    });
    const cashierMembership = await testPrisma.tenantMembership.create({
      data: {
        tenantId: tenantAId,
        userId: cashierUser.id,
        role: 'CASHIER',
      },
    });
    await testPrisma.membershipLocation.create({
      data: { tenantId: tenantAId, membershipId: cashierMembership.id, locationId: locationAId },
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

    // Create Products in Tenant A
    const p1 = await request(app.getHttpServer())
      .post('/api/products')
      .set('Cookie', ownerCookieA)
      .send({
        name: 'Alfajor Triple',
        barcode: '7791234567890',
        salePriceCents: 150000,
        unit: 'UNIT',
        initialStock: '10.0000',
      });
    expect(p1.status).toBe(201);
    productA1Id = p1.body.id;

    const p2 = await request(app.getHttpServer())
      .post('/api/products')
      .set('Cookie', ownerCookieA)
      .send({
        name: 'Bebida Cola 500ml',
        barcode: '7790987654321',
        salePriceCents: 200000,
        unit: 'UNIT',
        initialStock: '20.0000',
      });
    expect(p2.status).toBe(201);
    productA2Id = p2.body.id;
  });

  describe('1. Suppliers Management & Authorization', () => {
    it('returns 401 when calling supplier endpoints without session', async () => {
      const res = await request(app.getHttpServer()).get('/api/suppliers');
      expect(res.status).toBe(401);
    });

    it('returns 403 when CASHIER calls supplier endpoints', async () => {
      const resGet = await request(app.getHttpServer())
        .get('/api/suppliers')
        .set('Cookie', cashierCookieA);
      expect(resGet.status).toBe(403);

      const resPost = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Cookie', cashierCookieA)
        .send({ name: 'Proveedor Fantasma' });
      expect(resPost.status).toBe(403);
    });

    it('creates, reads, updates and deactivates supplier for OWNER', async () => {
      // 1. Create Supplier
      const createRes = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Distribuidora Golosinas S.R.L.',
          taxId: '30-71234567-8',
          phone: '11-4455-6677',
          email: 'contacto@distribuidora.com',
          address: 'Calle Falsa 123',
          notes: 'Días de entrega: Lunes',
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.name).toBe('Distribuidora Golosinas S.R.L.');
      expect(createRes.body.taxId).toBe('30712345678');
      expect(createRes.body.isActive).toBe(true);
      const supplierId = createRes.body.id;

      // 2. Reject duplicate taxId in same tenant
      const dupTaxId = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Otro Proveedor',
          taxId: '30712345678',
        });
      expect(dupTaxId.status).toBe(409);

      // 3. Same taxId in Tenant B is allowed (isolated per tenant)
      const tenantBTaxId = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Cookie', ownerCookieB)
        .send({
          name: 'Distribuidora B',
          taxId: '30712345678',
        });
      expect(tenantBTaxId.status).toBe(201);

      // 4. Update supplier
      const updateRes = await request(app.getHttpServer())
        .put(`/api/suppliers/${supplierId}`)
        .set('Cookie', ownerCookieA)
        .send({
          phone: '11-9988-7766',
        });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.phone).toBe('11-9988-7766');

      // 5. Deactivate supplier
      const deactRes = await request(app.getHttpServer())
        .patch(`/api/suppliers/${supplierId}/status`)
        .set('Cookie', ownerCookieA)
        .send({ isActive: false });
      expect(deactRes.status).toBe(200);
      expect(deactRes.body.isActive).toBe(false);

      // 6. Query suppliers with filters
      const listRes = await request(app.getHttpServer())
        .get('/api/suppliers?isActive=false')
        .set('Cookie', ownerCookieA);
      expect(listRes.status).toBe(200);
      expect(listRes.body.total).toBe(1);
      expect(listRes.body.items[0]?.id).toBe(supplierId);
    });
  });

  describe('2. Purchases Workflow: Draft, Calculations, Reception, Stock & Cost', () => {
    let supplierAId: string;

    beforeEach(async () => {
      const supp = await request(app.getHttpServer())
        .post('/api/suppliers')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Arcor Oficial',
          taxId: '30-50000000-1',
        });
      expect(supp.status).toBe(201);
      supplierAId = supp.body.id;

      const otherLocation = await testPrisma.location.create({
        data: { tenantId: tenantAId, name: 'Sucursal Oeste' },
      });
      const otherSession = await app.get(SessionService).createSession(testPrisma, {
        userId: ownerAUserId,
        tenantId: tenantAId,
        locationId: otherLocation.id,
      });
      ownerCookieAOtherLocation = `pulso_session=${otherSession.token}`;
    });

    async function createOutsideCashDraft(documentNumber: string, quantity = 4) {
      const res = await request(app.getHttpServer())
        .post('/api/purchases')
        .set('Cookie', ownerCookieA)
        .send({
          supplierId: supplierAId,
          documentNumber,
          paymentSource: 'OUTSIDE_CASH',
          items: [{ productId: productA1Id, quantity, unitCostCents: 10000 }],
        });
      expect(res.status).toBe(201);
      return res.body as { id: string; totalCents: number; version: number };
    }

    async function purchaseInvariants(purchaseId: string) {
      const [purchase, items, inventoryMovements, cashMovements] = await Promise.all([
        testPrisma.purchase.findUniqueOrThrow({ where: { id: purchaseId } }),
        testPrisma.purchaseItem.findMany({ where: { purchaseId }, orderBy: { productId: 'asc' } }),
        testPrisma.inventoryMovement.findMany({ where: { purchaseId } }),
        testPrisma.cashMovement.findMany({ where: { purchaseId } }),
      ]);

      return { purchase, items, inventoryMovements, cashMovements };
    }

    it('enforces If-Match, scoped conflicts, and unchanged failures for draft updates', async () => {
      const draft = await createOutsideCashDraft('CONCURRENCY-CONTRACT', 4);

      const current = await request(app.getHttpServer())
        .put(`/api/purchases/${draft.id}`)
        .set('Cookie', ownerCookieA)
        .set('If-Match', String(draft.version))
        .send({ discountCents: 10 });
      expect(current.status).toBe(200);
      expect(current.body).toMatchObject({
        id: draft.id,
        version: draft.version + 1,
        discountCents: 10,
      });

      const beforeFailures = await purchaseInvariants(draft.id);
      const staleWithInvalidRelations = await request(app.getHttpServer())
        .put(`/api/purchases/${draft.id}`)
        .set('Cookie', ownerCookieA)
        .set('If-Match', '0')
        .send({
          supplierId: 'inaccessible-supplier',
          items: [{ productId: 'inaccessible-product', quantity: 99, unitCostCents: 1 }],
        });
      expect(staleWithInvalidRelations.status).toBe(409);

      const missing = await request(app.getHttpServer())
        .put(`/api/purchases/${draft.id}`)
        .set('Cookie', ownerCookieA)
        .send({ discountCents: 20 });
      expect(missing.status).toBe(428);

      for (const invalid of ['"1"', 'W/"1"', '-1', '01', '1.0', '9007199254740992']) {
        const response = await request(app.getHttpServer())
          .put(`/api/purchases/${draft.id}`)
          .set('Cookie', ownerCookieA)
          .set('If-Match', invalid)
          .send({ discountCents: 20 });
        expect(response.status).toBe(400);
      }

      const repeatedHeader = ['1', '2'] as unknown as string;
      const repeated = await request(app.getHttpServer())
        .put(`/api/purchases/${draft.id}`)
        .set('Cookie', ownerCookieA)
        .set('If-Match', repeatedHeader)
        .send({ discountCents: 20 });
      expect(repeated.status).toBe(400);

      const otherTenant = await request(app.getHttpServer())
        .put(`/api/purchases/${draft.id}`)
        .set('Cookie', ownerCookieB)
        .set('If-Match', '1')
        .send({ discountCents: 20 });
      expect(otherTenant.status).toBe(404);

      const otherLocation = await request(app.getHttpServer())
        .put(`/api/purchases/${draft.id}`)
        .set('Cookie', ownerCookieAOtherLocation)
        .set('If-Match', '1')
        .send({ discountCents: 20 });
      expect(otherLocation.status).toBe(404);

      const afterFailures = await purchaseInvariants(draft.id);
      expect(afterFailures.purchase).toMatchObject({
        version: draft.version + 1,
        discountCents: 10,
        status: 'DRAFT',
      });
      expect(afterFailures.items).toEqual(beforeFailures.items);

      const receive = await request(app.getHttpServer())
        .post(`/api/purchases/${draft.id}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: '12340000-0000-4000-8000-000000000001' });
      expect(receive.status).toBe(200);

      const terminal = await request(app.getHttpServer())
        .put(`/api/purchases/${draft.id}`)
        .set('Cookie', ownerCookieA)
        .set('If-Match', String(receive.body.purchase.version))
        .send({ supplierId: 'inaccessible-supplier' });
      expect(terminal.status).toBe(409);
    });

    it('returns 403 when CASHIER attempts to access purchases', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/purchases')
        .set('Cookie', cashierCookieA);
      expect(res.status).toBe(403);
    });

    it('rejects same-tenant cross-location draft update and cancel without mutating the draft', async () => {
      // Spec R1: same-tenant different session location must use not-found semantics.
      const draft = await createOutsideCashDraft('R1-LOC', 4);
      const before = await purchaseInvariants(draft.id);

      const updateFromOtherLocation = await request(app.getHttpServer())
        .put(`/api/purchases/${draft.id}`)
        .set('Cookie', ownerCookieAOtherLocation)
        .set('If-Match', '0')
        .send({
          discountCents: 5000,
          items: [{ productId: productA2Id, quantity: 9, unitCostCents: 20000 }],
        });

      expect(updateFromOtherLocation.status).toBe(404);
      expect(updateFromOtherLocation.body).toMatchObject({ statusCode: 404 });

      const afterUpdate = await purchaseInvariants(draft.id);
      expect(afterUpdate.purchase.status).toBe('DRAFT');
      expect(afterUpdate.purchase.locationId).toBe(locationAId);
      expect(afterUpdate.purchase.discountCents).toBe(before.purchase.discountCents);
      expect(afterUpdate.purchase.totalCents).toBe(before.purchase.totalCents);
      expect(afterUpdate.items).toHaveLength(1);
      expect(afterUpdate.items[0]?.productId).toBe(productA1Id);
      expect(afterUpdate.items[0]?.quantity).toBe(4);

      const cancelFromOtherLocation = await request(app.getHttpServer())
        .post(`/api/purchases/${draft.id}/cancel`)
        .set('Cookie', ownerCookieAOtherLocation)
        .send({ reason: 'Sucursal equivocada' });

      expect(cancelFromOtherLocation.status).toBe(404);
      expect(cancelFromOtherLocation.body).toMatchObject({ statusCode: 404 });

      const afterCancel = await purchaseInvariants(draft.id);
      expect(afterCancel.purchase.status).toBe('DRAFT');
      expect(afterCancel.purchase.cancelledAtUtc).toBeNull();
      expect(afterCancel.purchase.cancelledByUserId).toBeNull();
      expect(afterCancel.items).toHaveLength(1);
      expect(afterCancel.items[0]?.productId).toBe(productA1Id);
      expect(afterCancel.items[0]?.quantity).toBe(4);
    });

    it('rejects RECEIVED and CANCELLED update/cancel with conflict while preserving persisted data', async () => {
      // Spec R2: non-DRAFT purchases are immutable through update/cancel.
      const receivedDraft = await createOutsideCashDraft('R2-RECEIVED', 6);
      const receiveRes = await request(app.getHttpServer())
        .post(`/api/purchases/${receivedDraft.id}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: 'dddd0001-0000-4000-8000-000000000001' });
      expect(receiveRes.status).toBe(200);
      const receivedBefore = await purchaseInvariants(receivedDraft.id);

      const updateReceived = await request(app.getHttpServer())
        .put(`/api/purchases/${receivedDraft.id}`)
        .set('Cookie', ownerCookieA)
        .set('If-Match', String(receivedBefore.purchase.version))
        .send({ discountCents: 1234 });
      expect(updateReceived.status).toBe(409);

      const cancelReceived = await request(app.getHttpServer())
        .post(`/api/purchases/${receivedDraft.id}/cancel`)
        .set('Cookie', ownerCookieA)
        .send({ reason: 'No debe cancelar recibido' });
      expect(cancelReceived.status).toBe(409);

      const receivedAfter = await purchaseInvariants(receivedDraft.id);
      expect(receivedAfter.purchase.status).toBe('RECEIVED');
      expect(receivedAfter.purchase.receivedAtUtc?.toISOString()).toBe(
        receivedBefore.purchase.receivedAtUtc?.toISOString()
      );
      expect(receivedAfter.purchase.idempotencyKey).toBe('dddd0001-0000-4000-8000-000000000001');
      expect(receivedAfter.purchase.totalCents).toBe(receivedBefore.purchase.totalCents);
      expect(receivedAfter.inventoryMovements).toHaveLength(1);
      expect(receivedAfter.cashMovements).toHaveLength(0);
      expect(receivedAfter.items).toHaveLength(1);
      expect(receivedAfter.items[0]?.quantity).toBe(6);

      const cancelledDraft = await createOutsideCashDraft('R2-CANCELLED', 2);
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/purchases/${cancelledDraft.id}/cancel`)
        .set('Cookie', ownerCookieA)
        .send({ reason: 'Pedido duplicado' });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('CANCELLED');

      const cancelledBefore = await purchaseInvariants(cancelledDraft.id);
      expect(cancelledBefore.purchase.status).toBe('CANCELLED');
      expect(cancelledBefore.purchase.cancelledAtUtc).not.toBeNull();
      expect(cancelledBefore.items).toHaveLength(1);

      const updateCancelled = await request(app.getHttpServer())
        .put(`/api/purchases/${cancelledDraft.id}`)
        .set('Cookie', ownerCookieA)
        .set('If-Match', String(cancelledBefore.purchase.version))
        .send({ discountCents: 777 });
      expect(updateCancelled.status).toBe(409);

      const cancelAgain = await request(app.getHttpServer())
        .post(`/api/purchases/${cancelledDraft.id}/cancel`)
        .set('Cookie', ownerCookieA)
        .send({ reason: 'Segundo intento' });
      expect(cancelAgain.status).toBe(409);

      const cancelledAfter = await purchaseInvariants(cancelledDraft.id);
      expect(cancelledAfter.purchase.status).toBe('CANCELLED');
      expect(cancelledAfter.purchase.cancelledAtUtc?.toISOString()).toBe(
        cancelledBefore.purchase.cancelledAtUtc?.toISOString()
      );
      expect(cancelledAfter.purchase.totalCents).toBe(cancelledBefore.purchase.totalCents);
      expect(cancelledAfter.items).toHaveLength(1);
      expect(cancelledAfter.items[0]?.quantity).toBe(2);
      expect(cancelledAfter.inventoryMovements).toHaveLength(0);
      expect(cancelledAfter.cashMovements).toHaveLength(0);
    });

    it('keeps receive replay and missing-context behavior isolated without duplicate effects', async () => {
      // Spec R4: existing idempotent replay remains; wrong location is hidden as not found.
      const replayDraft = await createOutsideCashDraft('R4-REPLAY', 3);
      const firstReceive = await request(app.getHttpServer())
        .post(`/api/purchases/${replayDraft.id}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: 'eeee0001-0000-4000-8000-000000000001' });
      expect(firstReceive.status).toBe(200);
      expect(firstReceive.body.idempotentReplay).toBe(false);

      const replayReceive = await request(app.getHttpServer())
        .post(`/api/purchases/${replayDraft.id}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: 'eeee0001-0000-4000-8000-000000000001' });
      expect(replayReceive.status).toBe(200);
      expect(replayReceive.body.idempotentReplay).toBe(true);

      const replayState = await purchaseInvariants(replayDraft.id);
      expect(replayState.purchase.status).toBe('RECEIVED');
      expect(replayState.inventoryMovements).toHaveLength(1);
      expect(replayState.cashMovements).toHaveLength(0);

      const wrongLocationReplay = await request(app.getHttpServer())
        .post(`/api/purchases/${replayDraft.id}/receive`)
        .set('Cookie', ownerCookieAOtherLocation)
        .send({ idempotencyKey: 'eeee0001-0000-4000-8000-000000000001' });
      expect(wrongLocationReplay.status).toBe(404);
      expect(wrongLocationReplay.body).toMatchObject({ statusCode: 404 });
      expect(wrongLocationReplay.body.purchase).toBeUndefined();

      const afterWrongLocationReplay = await purchaseInvariants(replayDraft.id);
      expect(afterWrongLocationReplay.purchase.status).toBe('RECEIVED');
      expect(afterWrongLocationReplay.inventoryMovements).toHaveLength(1);
      expect(afterWrongLocationReplay.cashMovements).toHaveLength(0);

      const wrongLocationDraft = await createOutsideCashDraft('R4-MISSING-CONTEXT', 5);
      const wrongLocationReceive = await request(app.getHttpServer())
        .post(`/api/purchases/${wrongLocationDraft.id}/receive`)
        .set('Cookie', ownerCookieAOtherLocation)
        .send({ idempotencyKey: 'eeee0002-0000-4000-8000-000000000002' });
      expect(wrongLocationReceive.status).toBe(404);

      const wrongLocationState = await purchaseInvariants(wrongLocationDraft.id);
      expect(wrongLocationState.purchase.status).toBe('DRAFT');
      expect(wrongLocationState.purchase.receivedAtUtc).toBeNull();
      expect(wrongLocationState.purchase.idempotencyKey).toBeNull();
      expect(wrongLocationState.inventoryMovements).toHaveLength(0);
      expect(wrongLocationState.cashMovements).toHaveLength(0);
    });

    it('returns one effective winner for receive versus stale update or cancel attempts', async () => {
      // Spec R3: once receive wins, stale update/cancel lose without duplicating side effects.
      const updateRaceDraft = await createOutsideCashDraft('R3-UPDATE', 7);
      const receiveWinsUpdate = await request(app.getHttpServer())
        .post(`/api/purchases/${updateRaceDraft.id}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: 'ffff0001-0000-4000-8000-000000000001' });
      expect(receiveWinsUpdate.status).toBe(200);

      const staleUpdate = await request(app.getHttpServer())
        .put(`/api/purchases/${updateRaceDraft.id}`)
        .set('Cookie', ownerCookieA)
        .set('If-Match', '0')
        .send({ items: [{ productId: productA2Id, quantity: 99, unitCostCents: 15000 }] });
      expect(staleUpdate.status).toBe(409);

      const updateRaceState = await purchaseInvariants(updateRaceDraft.id);
      expect(updateRaceState.purchase.status).toBe('RECEIVED');
      expect(updateRaceState.purchase.idempotencyKey).toBe('ffff0001-0000-4000-8000-000000000001');
      expect(updateRaceState.items).toHaveLength(1);
      expect(updateRaceState.items[0]?.productId).toBe(productA1Id);
      expect(updateRaceState.items[0]?.quantity).toBe(7);
      expect(updateRaceState.inventoryMovements).toHaveLength(1);
      expect(updateRaceState.cashMovements).toHaveLength(0);

      const cancelRaceDraft = await createOutsideCashDraft('R3-CANCEL', 8);
      const receiveWinsCancel = await request(app.getHttpServer())
        .post(`/api/purchases/${cancelRaceDraft.id}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: 'ffff0002-0000-4000-8000-000000000002' });
      expect(receiveWinsCancel.status).toBe(200);

      const staleCancel = await request(app.getHttpServer())
        .post(`/api/purchases/${cancelRaceDraft.id}/cancel`)
        .set('Cookie', ownerCookieA)
        .send({ reason: 'Lleg� tarde' });
      expect(staleCancel.status).toBe(409);

      const cancelRaceState = await purchaseInvariants(cancelRaceDraft.id);
      expect(cancelRaceState.purchase.status).toBe('RECEIVED');
      expect(cancelRaceState.purchase.cancelledAtUtc).toBeNull();
      expect(cancelRaceState.purchase.idempotencyKey).toBe('ffff0002-0000-4000-8000-000000000002');
      expect(cancelRaceState.items).toHaveLength(1);
      expect(cancelRaceState.items[0]?.quantity).toBe(8);
      expect(cancelRaceState.inventoryMovements).toHaveLength(1);
      expect(cancelRaceState.cashMovements).toHaveLength(0);
    });

    it('creates draft without affecting stock, allows edits, and cancels cleanly', async () => {
      // 1. Create Draft
      const draftRes = await request(app.getHttpServer())
        .post('/api/purchases')
        .set('Cookie', ownerCookieA)
        .send({
          supplierId: supplierAId,
          documentNumber: 'FC-0001',
          discountCents: 10000,
          additionalCostCents: 5000,
          paymentSource: 'OUTSIDE_CASH',
          items: [{ productId: productA1Id, quantity: 20, unitCostCents: 90000 }],
        });
      expect(draftRes.status).toBe(201);
      expect(draftRes.body.status).toBe('DRAFT');
      // Subtotal = 20 * 90000 = 1800000. Total = 1800000 - 10000 + 5000 = 1795000.
      expect(draftRes.body.subtotalCents).toBe(1800000);
      expect(draftRes.body.totalCents).toBe(1795000);
      const purchaseId = draftRes.body.id;

      // 2. Verify stock is completely unchanged (initial 10)
      const stockBefore = await testPrisma.productLocation.findUnique({
        where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
      });
      expect(Number(stockBefore?.stockQuantity)).toBe(10);
      expect(stockBefore?.lastCostCents).toBeNull();

      // 3. Update Draft (change quantities and discount)
      const updateRes = await request(app.getHttpServer())
        .put(`/api/purchases/${purchaseId}`)
        .set('Cookie', ownerCookieA)
        .set('If-Match', String(draftRes.body.version))
        .send({
          discountCents: 20000,
          items: [{ productId: productA1Id, quantity: 30, unitCostCents: 85000 }],
        });
      expect(updateRes.status).toBe(200);
      // Subtotal = 30 * 85000 = 2550000. Total = 2550000 - 20000 + 5000 = 2535000.
      expect(updateRes.body.subtotalCents).toBe(2550000);
      expect(updateRes.body.totalCents).toBe(2535000);

      // 4. Cancel Draft
      const cancelRes = await request(app.getHttpServer())
        .post(`/api/purchases/${purchaseId}/cancel`)
        .set('Cookie', ownerCookieA)
        .send({ reason: 'Error en pedido' });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('CANCELLED');

      // 5. Cannot receive a cancelled purchase
      const receiveFail = await request(app.getHttpServer())
        .post(`/api/purchases/${purchaseId}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: '00000000-0000-4000-8000-000000000099' });
      expect(receiveFail.status).toBe(400);
    });

    it('rolls back receive side effects when a concurrent draft update or cancel wins first', async () => {
      // Spec R3: draft mutation wins race; losing receive leaves no receipt, stock, cash, or idempotency effects.
      await testPrisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION pulso_test_pause_inventory_movement()
        RETURNS trigger AS $$
        BEGIN
          PERFORM pg_sleep(0.5);
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await testPrisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS pulso_test_pause_inventory_movement_trigger ON "inventory_movements";'
      );
      await testPrisma.$executeRawUnsafe(`
        CREATE TRIGGER pulso_test_pause_inventory_movement_trigger
        BEFORE INSERT ON "inventory_movements"
        FOR EACH ROW EXECUTE FUNCTION pulso_test_pause_inventory_movement();
      `);

      try {
        const updateRaceDraft = await createOutsideCashDraft('R3-MUTATION-WINS-UPDATE', 4);
        const updateReceive = request(app.getHttpServer())
          .post(`/api/purchases/${updateRaceDraft.id}/receive`)
          .set('Cookie', ownerCookieA)
          .send({ idempotencyKey: '99990001-0000-4000-8000-000000000001' })
          .then((res) => res);
        const updateReceiveState = await Promise.race([
          updateReceive.then(() => 'settled' as const),
          new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
        ]);
        if (updateReceiveState !== 'pending') {
          throw new Error('Receive settled before update could win the race');
        }

        const updateWinner = await request(app.getHttpServer())
          .put(`/api/purchases/${updateRaceDraft.id}`)
          .set('Cookie', ownerCookieA)
          .set('If-Match', String(updateRaceDraft.version))
          .send({ discountCents: 1 });
        const updateReceiveLoser = await updateReceive;

        expect(updateWinner.status).toBe(200);
        expect(updateReceiveLoser.status).toBe(409);

        const afterUpdateRace = await purchaseInvariants(updateRaceDraft.id);
        expect(afterUpdateRace.purchase.status).toBe('DRAFT');
        expect(afterUpdateRace.purchase.receivedAtUtc).toBeNull();
        expect(afterUpdateRace.purchase.idempotencyKey).toBeNull();
        expect(afterUpdateRace.purchase.discountCents).toBe(1);
        expect(afterUpdateRace.inventoryMovements).toHaveLength(0);
        expect(afterUpdateRace.cashMovements).toHaveLength(0);

        const cancelRaceDraft = await createOutsideCashDraft('R3-MUTATION-WINS-CANCEL', 4);
        const cancelReceive = request(app.getHttpServer())
          .post(`/api/purchases/${cancelRaceDraft.id}/receive`)
          .set('Cookie', ownerCookieA)
          .send({ idempotencyKey: '99990002-0000-4000-8000-000000000002' })
          .then((res) => res);
        const cancelReceiveState = await Promise.race([
          cancelReceive.then(() => 'settled' as const),
          new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 100)),
        ]);
        if (cancelReceiveState !== 'pending') {
          throw new Error('Receive settled before cancel could win the race');
        }

        const cancelWinner = await request(app.getHttpServer())
          .post(`/api/purchases/${cancelRaceDraft.id}/cancel`)
          .set('Cookie', ownerCookieA)
          .send({ reason: 'Cancel wins before receive' });
        const cancelReceiveLoser = await cancelReceive;

        expect(cancelWinner.status).toBe(200);
        expect([400, 409]).toContain(cancelReceiveLoser.status);

        const afterCancelRace = await purchaseInvariants(cancelRaceDraft.id);
        expect(afterCancelRace.purchase.status).toBe('CANCELLED');
        expect(afterCancelRace.purchase.receivedAtUtc).toBeNull();
        expect(afterCancelRace.purchase.idempotencyKey).toBeNull();
        expect(afterCancelRace.purchase.cancelledAtUtc).not.toBeNull();
        expect(afterCancelRace.inventoryMovements).toHaveLength(0);
        expect(afterCancelRace.cashMovements).toHaveLength(0);
      } finally {
        await testPrisma.$executeRawUnsafe(
          'DROP TRIGGER IF EXISTS pulso_test_pause_inventory_movement_trigger ON "inventory_movements";'
        );
        await testPrisma.$executeRawUnsafe(
          'DROP FUNCTION IF EXISTS pulso_test_pause_inventory_movement();'
        );
      }
    }, 15000);

    it('receives purchase with OUTSIDE_CASH: increments stock, creates InventoryMovement, updates lastCostCents, leaves cash untouched', async () => {
      // 1. Create Draft
      const draftRes = await request(app.getHttpServer())
        .post('/api/purchases')
        .set('Cookie', ownerCookieA)
        .send({
          supplierId: supplierAId,
          documentNumber: 'FC-0002',
          paymentSource: 'OUTSIDE_CASH',
          items: [
            { productId: productA1Id, quantity: 15, unitCostCents: 95000 },
            { productId: productA2Id, quantity: 10, unitCostCents: 110000 },
          ],
        });
      const purchaseId = draftRes.body.id;

      // 2. Receive Purchase
      const receiveRes = await request(app.getHttpServer())
        .post(`/api/purchases/${purchaseId}/receive`)
        .set('Cookie', ownerCookieA)
        .send({
          idempotencyKey: 'aaaa0001-0000-4000-8000-000000000001',
        });
      expect(receiveRes.status).toBe(200);
      expect(receiveRes.body.success).toBe(true);
      expect(receiveRes.body.purchase.status).toBe('RECEIVED');
      expect(receiveRes.body.purchase.receivedAtUtc).not.toBeNull();
      expect(receiveRes.body.idempotentReplay).toBe(false);

      // 3. Verify Stock updated:
      // Product A1: 10 + 15 = 25
      const stock1 = await testPrisma.productLocation.findUnique({
        where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
      });
      expect(Number(stock1?.stockQuantity)).toBe(25);
      expect(stock1?.lastCostCents).toBe(95000);

      // Product A2: 20 + 10 = 30
      const stock2 = await testPrisma.productLocation.findUnique({
        where: { productId_locationId: { productId: productA2Id, locationId: locationAId } },
      });
      expect(Number(stock2?.stockQuantity)).toBe(30);
      expect(stock2?.lastCostCents).toBe(110000);

      // 4. Verify InventoryMovement records created with type PURCHASE
      const movements = await testPrisma.inventoryMovement.findMany({
        where: { purchaseId, type: 'PURCHASE' },
      });
      expect(movements).toHaveLength(2);

      // 5. Zero CashMovement created because paymentSource was OUTSIDE_CASH
      const cashMovements = await testPrisma.cashMovement.findMany({
        where: { purchaseId },
      });
      expect(cashMovements).toHaveLength(0);

      // 6. Repeat receive with same idempotencyKey -> returns idempotentReplay: true without duplicating
      const replayRes = await request(app.getHttpServer())
        .post(`/api/purchases/${purchaseId}/receive`)
        .set('Cookie', ownerCookieA)
        .send({
          idempotencyKey: 'aaaa0001-0000-4000-8000-000000000001',
        });
      expect(replayRes.status).toBe(200);
      expect(replayRes.body.idempotentReplay).toBe(true);

      // Verify stock still 25, not 40
      const stock1After = await testPrisma.productLocation.findUnique({
        where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
      });
      expect(Number(stock1After?.stockQuantity)).toBe(25);
    });

    it('receives purchase with CASH_REGISTER: verifies shift balance, creates CASH_OUT movement, rejects when no shift or insufficient funds', async () => {
      // 1. Create Purchase Draft for $300.00 (30000 cents) with CASH_REGISTER
      const draftRes = await request(app.getHttpServer())
        .post('/api/purchases')
        .set('Cookie', ownerCookieA)
        .send({
          supplierId: supplierAId,
          paymentSource: 'CASH_REGISTER',
          items: [{ productId: productA1Id, quantity: 3, unitCostCents: 10000 }],
        });
      const purchaseId = draftRes.body.id;
      expect(draftRes.body.totalCents).toBe(30000);

      // 2. Attempt receive without open shift -> 400 Bad Request
      const noShiftRes = await request(app.getHttpServer())
        .post(`/api/purchases/${purchaseId}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: 'bbbb0001-0000-4000-8000-000000000001' });
      expect(noShiftRes.status).toBe(400);
      expect(noShiftRes.body.message).toContain('No hay un turno de caja abierto');

      // 3. Open shift with insufficient funds: $200.00 (20000 cents) vs purchase $300.00 (30000 cents)
      const openShiftRes = await request(app.getHttpServer())
        .post('/api/cash/shifts/open')
        .set('Cookie', ownerCookieA)
        .send({
          openingAmountCents: 20000,
          idempotencyKey: 'bbbb0002-0000-4000-8000-000000000002',
        });
      expect(openShiftRes.status).toBe(200);
      const shiftId = openShiftRes.body.shift.id;

      // 4. Attempt receive -> 400 Insufficient funds
      const insuffRes = await request(app.getHttpServer())
        .post(`/api/purchases/${purchaseId}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: 'bbbb0003-0000-4000-8000-000000000003' });
      expect(insuffRes.status).toBe(400);
      expect(insuffRes.body.message).toContain('Saldo insuficiente en caja');

      // 5. Ingress money to register: +$500.00 (50000 cents) -> Expected balance is 70000
      await request(app.getHttpServer())
        .post('/api/cash/movements/in')
        .set('Cookie', ownerCookieA)
        .send({
          amountCents: 50000,
          reason: 'Fondo adicional',
          idempotencyKey: 'bbbb0004-0000-4000-8000-000000000004',
        });

      // 6. Receive purchase -> Succeeds
      const receiveOk = await request(app.getHttpServer())
        .post(`/api/purchases/${purchaseId}/receive`)
        .set('Cookie', ownerCookieA)
        .send({ idempotencyKey: 'bbbb0005-0000-4000-8000-000000000005' });
      expect(receiveOk.status).toBe(200);
      expect(receiveOk.body.purchase.status).toBe('RECEIVED');
      expect(receiveOk.body.purchase.cashShiftId).toBe(shiftId);

      // 7. Verify CashMovement of type CASH_OUT was created in database
      const cashOut = await testPrisma.cashMovement.findFirst({
        where: { purchaseId, type: 'CASH_OUT' },
      });
      expect(cashOut).not.toBeNull();
      expect(cashOut?.amountCents).toBe(30000);
      expect(cashOut?.signedAmountCents).toBe(-30000);

      // 8. Verify active shift balance: 70000 - 30000 = 40000 ($400.00)
      const activeShift = await request(app.getHttpServer())
        .get('/api/cash/active')
        .set('Cookie', ownerCookieA);
      expect(activeShift.body.summary.expectedAmountCents).toBe(40000);
      expect(activeShift.body.summary.cashOutAmountCents).toBe(30000);
    });

    it('handles concurrent receptions deterministically via Promise.all', async () => {
      // Create 2 separate purchases affecting productA1
      const pA = await request(app.getHttpServer())
        .post('/api/purchases')
        .set('Cookie', ownerCookieA)
        .send({
          supplierId: supplierAId,
          items: [{ productId: productA1Id, quantity: 10, unitCostCents: 5000 }],
        });
      const pB = await request(app.getHttpServer())
        .post('/api/purchases')
        .set('Cookie', ownerCookieA)
        .send({
          supplierId: supplierAId,
          items: [{ productId: productA1Id, quantity: 15, unitCostCents: 6000 }],
        });

      // Launch receptions concurrently
      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/purchases/${pA.body.id}/receive`)
          .set('Cookie', ownerCookieA)
          .send({ idempotencyKey: 'cccc0001-0000-4000-8000-000000000001' }),
        request(app.getHttpServer())
          .post(`/api/purchases/${pB.body.id}/receive`)
          .set('Cookie', ownerCookieA)
          .send({ idempotencyKey: 'cccc0002-0000-4000-8000-000000000002' }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // Stock was initially 10. Received 10 + 15 = 25. Final stock must be strictly 35!
      const finalStock = await testPrisma.productLocation.findUnique({
        where: { productId_locationId: { productId: productA1Id, locationId: locationAId } },
      });
      expect(Number(finalStock?.stockQuantity)).toBe(35);
    });
  });
});
