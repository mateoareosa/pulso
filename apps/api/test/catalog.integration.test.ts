import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { RateLimiterService } from '../src/auth/rate-limiter.service.js';
import { hashPassword } from '../src/auth/security.utils.js';
import { Prisma } from '@prisma/client';
import { ProductResponse } from '@pulso/contracts';

function extractCookieValue(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = cookies.find((c) => c.startsWith('pulso_session='));
  if (typeof found !== 'string') throw new Error('Expected pulso_session cookie was not found');
  const part = found.split(';')[0];
  return part ?? '';
}

describe('Catalog & Inventory Integration Suite (PostgreSQL Real)', () => {
  let app: INestApplication;
  let ownerCookieA: string;
  let cashierCookieA: string;
  let ownerCookieB: string;
  let tenantAId: string;
  let tenantBId: string;
  let locationAId: string;

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
    tenantBId = regB.body.tenant.id;
  });

  describe('Categories CRUD & Isolation', () => {
    it('creates and lists categories within tenant', async () => {
      const resCreate = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Cookie', ownerCookieA)
        .send({ name: 'Golosinas y Chocolates' });
      expect(resCreate.status).toBe(201);
      expect(resCreate.body.name).toBe('Golosinas y Chocolates');
      expect(resCreate.body.tenantId).toBe(tenantAId);

      const resList = await request(app.getHttpServer())
        .get('/api/categories')
        .set('Cookie', ownerCookieA);
      expect(resList.status).toBe(200);
      expect(resList.body).toHaveLength(1);
      expect(resList.body[0].name).toBe('Golosinas y Chocolates');
    });

    it('rejects duplicated category name in same tenant (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .post('/api/categories')
        .set('Cookie', ownerCookieA)
        .send({ name: 'Bebidas Frías' });

      const resDupe = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Cookie', ownerCookieA)
        .send({ name: 'bebidas frías' }); // accent/case insensitive
      expect(resDupe.status).toBe(409);
    });

    it('allows same category name in different tenants', async () => {
      const resA = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Cookie', ownerCookieA)
        .send({ name: 'Bebidas' });
      expect(resA.status).toBe(201);

      const resB = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Cookie', ownerCookieB)
        .send({ name: 'Bebidas' });
      expect(resB.status).toBe(201);
      expect(resB.body.tenantId).toBe(tenantBId);
    });

    it('forbids CASHIER from creating or updating categories (403 Forbidden)', async () => {
      const resCreate = await request(app.getHttpServer())
        .post('/api/categories')
        .set('Cookie', cashierCookieA)
        .send({ name: 'Snacks' });
      expect(resCreate.status).toBe(403);
    });
  });

  describe('Products CRUD & Isolation', () => {
    it('creates product with initial stock and quickSlot', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Alfajor Triple Dulce de Leche',
          barcode: '779001',
          sku: 'ALF-001',
          salePriceCents: 120000,
          costPriceCents: 75000,
          initialStock: '50.0000',
          minimumStock: '10.0000',
          quickSlot: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Alfajor Triple Dulce de Leche');
      expect(res.body.barcode).toBe('779001');
      expect(res.body.locationSettings).toBeDefined();
      expect(res.body.locationSettings.stockQuantity).toBe('50.0000');
      expect(res.body.locationSettings.quickSlot).toBe(1);

      // Verify audit movement created
      const movements = await testPrisma.inventoryMovement.findMany({
        where: { productId: res.body.id },
      });
      expect(movements).toHaveLength(1);
      expect(movements[0]?.type).toBe('INITIAL');
      expect(movements[0]?.resultingStock.toString()).toBe('50');
    });

    it('rejects duplicated barcode within same tenant (409 Conflict)', async () => {
      await request(app.getHttpServer()).post('/api/products').set('Cookie', ownerCookieA).send({
        name: 'Producto 1',
        barcode: '779123456',
        salePriceCents: 1000,
      });

      const resDupe = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Producto 2',
          barcode: '779123456',
          salePriceCents: 2000,
        });
      expect(resDupe.status).toBe(409);
    });

    it('allows identical barcode in different tenants', async () => {
      const resA = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Gaseosa Cola',
          barcode: '779123456',
          salePriceCents: 1500,
        });
      expect(resA.status).toBe(201);

      const resB = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieB)
        .send({
          name: 'Gaseosa Cola Tenant B',
          barcode: '779123456',
          salePriceCents: 1600,
        });
      expect(resB.status).toBe(201);
    });

    it('rejects duplicated quickSlot in the same location (409 Conflict)', async () => {
      await request(app.getHttpServer()).post('/api/products').set('Cookie', ownerCookieA).send({
        name: 'Slot 1 Item',
        salePriceCents: 1000,
        quickSlot: 1,
      });

      const resDupeSlot = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Otro Slot 1 Item',
          salePriceCents: 2000,
          quickSlot: 1,
        });
      expect(resDupeSlot.status).toBe(409);
    });

    it('strict cross-tenant isolation: Tenant B cannot see or modify Tenant A product', async () => {
      const prodA = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Secreto Tenant A',
          salePriceCents: 50000,
        });

      // Tenant B tries to get it by ID
      const resGet = await request(app.getHttpServer())
        .get(`/api/products/${prodA.body.id}`)
        .set('Cookie', ownerCookieB);
      expect(resGet.status).toBe(404);

      // Tenant B tries to update it
      const resUpdate = await request(app.getHttpServer())
        .patch(`/api/products/${prodA.body.id}`)
        .set('Cookie', ownerCookieB)
        .send({ name: 'Hackeado' });
      expect(resUpdate.status).toBe(404);

      // Tenant B lists products and sees empty
      const resListB = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieB);
      expect(resListB.body.items).toHaveLength(0);
    });
  });

  describe('Search, Filtering & Pagination', () => {
    beforeEach(async () => {
      // Seed 10 distinct products in Tenant A
      const items = [
        {
          name: 'Alfajor Triple Chocolate',
          barcode: '779001',
          salePriceCents: 120000,
          quickSlot: 1,
        },
        { name: 'Gaseosa Cola 500ml', barcode: '779002', salePriceCents: 150000, quickSlot: 2 },
        { name: 'Agua Mineral Con Gas', barcode: '779003', salePriceCents: 100000, quickSlot: 3 },
        { name: 'Caramelos Ácidos Frutales', barcode: '779004', salePriceCents: 80000 },
        { name: 'Chicles Menta Fuerte', barcode: '779005', salePriceCents: 60000 },
      ];

      for (const item of items) {
        await request(app.getHttpServer())
          .post('/api/products')
          .set('Cookie', ownerCookieA)
          .send(item);
      }
    });

    it('performs accent and case-insensitive search', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products?q=acidos')
        .set('Cookie', ownerCookieA);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].name).toBe('Caramelos Ácidos Frutales');
    });

    it('prioritizes exact barcode match at top of search results', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products?q=779002')
        .set('Cookie', ownerCookieA);
      expect(res.status).toBe(200);
      expect(res.body.items[0].barcode).toBe('779002');
      expect(res.body.items[0].name).toBe('Gaseosa Cola 500ml');
    });

    it('returns only the exact product for the dedicated barcode filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products')
        .query({ barcode: '779002' })
        .set('Cookie', cashierCookieA);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].barcode).toBe('779002');
      expect(res.body.items[0].name).toBe('Gaseosa Cola 500ml');
    });

    it('returns a safe empty result when an exact scanned barcode does not exist', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products')
        .query({ barcode: '0000000000000' })
        .set('Cookie', cashierCookieA);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0, page: 1, totalPages: 1 });
    });

    it('rejects a blank barcode filter instead of falling back to the full catalog', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/products')
        .query({ barcode: '   ' })
        .set('Cookie', cashierCookieA);

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Parámetros de búsqueda inválidos');
    });

    it('hides inactive or unavailable products from CASHIER', async () => {
      // Deactivate product 1
      const list = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA);
      const prodToDeactivate = list.body.items[0];

      await request(app.getHttpServer())
        .patch(`/api/products/${prodToDeactivate.id}`)
        .set('Cookie', ownerCookieA)
        .send({ isActive: false });

      // Owner with includeInactive can see it
      const resOwner = await request(app.getHttpServer())
        .get('/api/products?includeInactive=true')
        .set('Cookie', ownerCookieA);
      expect(resOwner.body.items.some((p: { id: string }) => p.id === prodToDeactivate.id)).toBe(
        true
      );

      // Cashier CANNOT see inactive product
      const resCashier = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', cashierCookieA);
      expect(resCashier.body.items.some((p: { id: string }) => p.id === prodToDeactivate.id)).toBe(
        false
      );
    });

    it('handles pagination correctly with more than 100 products', async () => {
      // Bulk insert 110 products in database for Tenant A
      const bulkData = Array.from({ length: 110 }, (_, i) => ({
        tenantId: tenantAId,
        name: `Producto Paginado ${String(i).padStart(3, '0')}`,
        normalizedName: `producto paginado ${String(i).padStart(3, '0')}`,
        barcode: `888${String(i).padStart(5, '0')}`,
        salePriceCents: 1000 + i * 10,
        unit: 'UNIT',
        isActive: true,
      }));

      await testPrisma.product.createMany({ data: bulkData });

      // Associate them with locationA
      const createdProds = await testPrisma.product.findMany({
        where: { tenantId: tenantAId, barcode: { startsWith: '888' } },
      });
      await testPrisma.productLocation.createMany({
        data: createdProds.map((p) => ({
          productId: p.id,
          locationId: locationAId,
          stockQuantity: 10,
          minimumStock: 2,
          isAvailable: true,
          version: 1,
        })),
      });

      const page1 = await request(app.getHttpServer())
        .get('/api/products?limit=50&page=1')
        .set('Cookie', ownerCookieA);
      expect(page1.status).toBe(200);
      expect(page1.body.items).toHaveLength(50);
      expect(page1.body.total).toBeGreaterThanOrEqual(115);
      expect(page1.body.totalPages).toBeGreaterThanOrEqual(3);

      const page2 = await request(app.getHttpServer())
        .get('/api/products?limit=50&page=2')
        .set('Cookie', ownerCookieA);
      expect(page2.status).toBe(200);
      expect(page2.body.items).toHaveLength(50);

      // Verify no overlap
      const idsPage1 = new Set(page1.body.items.map((it: { id: string }) => it.id));
      const overlap = page2.body.items.filter((it: { id: string }) => idsPage1.has(it.id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('Inventory Adjustments & Atomic Concurrency', () => {
    let testProductId: string;

    beforeEach(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Barra de Chocolate 100g',
          salePriceCents: 250000,
          initialStock: '20.0000',
        });
      testProductId = res.body.id;
    });

    it('performs positive stock adjustment (ADJUSTMENT_IN) atomically', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/products/${testProductId}/stock-adjustments`)
        .set('Cookie', ownerCookieA)
        .send({
          type: 'ADJUSTMENT_IN',
          quantity: '15.0000',
          reason: 'Llegada de pedido distribuidora #9912',
          expectedVersion: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.productLocation.stockQuantity).toBe('35.0000');
      expect(res.body.productLocation.version).toBe(2);
      expect(res.body.movement.type).toBe('ADJUSTMENT_IN');
      expect(res.body.movement.delta).toBe('15.0000');
      expect(res.body.movement.previousStock).toBe('20.0000');
      expect(res.body.movement.resultingStock).toBe('35.0000');
    });

    it('rejects adjustment that leads to negative stock (409 Conflict)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/products/${testProductId}/stock-adjustments`)
        .set('Cookie', ownerCookieA)
        .send({
          type: 'ADJUSTMENT_OUT',
          quantity: '25.0000', // current stock is 20
          reason: 'Pérdida por vencimiento',
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('negativo');

      // Verify stock in database remains unmodified
      const loc = await testPrisma.productLocation.findFirst({
        where: { productId: testProductId },
      });
      expect(loc?.stockQuantity.toString()).toBe('20');
    });

    it('detects concurrency conflict when expectedVersion is stale (409 Conflict)', async () => {
      // First adjustment moves version from 1 to 2
      await request(app.getHttpServer())
        .post(`/api/products/${testProductId}/stock-adjustments`)
        .set('Cookie', ownerCookieA)
        .send({
          type: 'ADJUSTMENT_IN',
          quantity: '5.0000',
          reason: 'Ajuste 1',
          expectedVersion: 1,
        });

      // Second adjustment still expects version 1
      const resStale = await request(app.getHttpServer())
        .post(`/api/products/${testProductId}/stock-adjustments`)
        .set('Cookie', ownerCookieA)
        .send({
          type: 'ADJUSTMENT_IN',
          quantity: '5.0000',
          reason: 'Ajuste 2 con versión obsoleta',
          expectedVersion: 1,
        });

      expect(resStale.status).toBe(409);
      expect(resStale.body.message).toContain('concurrencia');
    });

    it('retrieves recent audit movements for product', async () => {
      await request(app.getHttpServer())
        .post(`/api/products/${testProductId}/stock-adjustments`)
        .set('Cookie', ownerCookieA)
        .send({
          type: 'ADJUSTMENT_IN',
          quantity: '10.0000',
          reason: 'Primer ajuste auditado',
        });

      const res = await request(app.getHttpServer())
        .get(`/api/products/${testProductId}/stock-movements`)
        .set('Cookie', ownerCookieA);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThanOrEqual(2); // INITIAL + ADJUSTMENT_IN
      expect(res.body[0].reason).toBe('Primer ajuste auditado');
      expect(res.body[0].user).toBeDefined();
      expect(res.body[0].user.name).toBe('Dueño A');
    });

    it('enforces real atomic concurrency with Promise.all on same expectedVersion (exact 1 winner, 1 409)', async () => {
      // Current stock is 20, version is 1
      const initialLoc = await testPrisma.productLocation.findUniqueOrThrow({
        where: { productId_locationId: { productId: testProductId, locationId: locationAId } },
      });
      expect(initialLoc.version).toBe(1);
      expect(initialLoc.stockQuantity.toString()).toBe('20');

      const countMovementsBefore = await testPrisma.inventoryMovement.count({
        where: { productId: testProductId },
      });

      // Launch TWO genuinely concurrent requests with expectedVersion: 1
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/products/${testProductId}/stock-adjustments`)
          .set('Cookie', ownerCookieA)
          .send({
            type: 'ADJUSTMENT_IN',
            quantity: '10.0000',
            reason: 'Ajuste concurrente 1',
            expectedVersion: 1,
          }),
        request(app.getHttpServer())
          .post(`/api/products/${testProductId}/stock-adjustments`)
          .set('Cookie', ownerCookieA)
          .send({
            type: 'ADJUSTMENT_IN',
            quantity: '15.0000',
            reason: 'Ajuste concurrente 2',
            expectedVersion: 1,
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Assert version incremented exactly once (from 1 to 2)
      const finalLoc = await testPrisma.productLocation.findUniqueOrThrow({
        where: { productId_locationId: { productId: testProductId, locationId: locationAId } },
      });
      expect(finalLoc.version).toBe(2);

      // Assert stock reflects exactly the winner's operation (either 20+10=30 or 20+15=35)
      const winner = res1.status === 201 ? res1 : res2;
      const loser = res1.status === 409 ? res1 : res2;

      expect(winner.body.movement).toBeDefined();
      expect(loser.body.message).toContain('concurrencia');
      const expectedWinnerStock = res1.status === 201 ? '30' : '35';
      expect(finalLoc.stockQuantity.toString()).toBe(expectedWinnerStock);

      // Assert exactly one new movement was created
      const countMovementsAfter = await testPrisma.inventoryMovement.count({
        where: { productId: testProductId },
      });
      expect(countMovementsAfter).toBe(countMovementsBefore + 1);
    });

    it('catches concurrent duplicate creation and returns HTTP 409 Conflict with operational message', async () => {
      const [create1, create2] = await Promise.all([
        request(app.getHttpServer()).post('/api/products').set('Cookie', ownerCookieA).send({
          name: 'Producto Duplicado Concurrente A',
          barcode: '779000999888',
          salePriceCents: 50000,
        }),
        request(app.getHttpServer()).post('/api/products').set('Cookie', ownerCookieA).send({
          name: 'Producto Duplicado Concurrente B',
          barcode: '779000999888',
          salePriceCents: 60000,
        }),
      ]);

      const statuses = [create1.status, create2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const conflictRes = create1.status === 409 ? create1 : create2;
      expect(conflictRes.body.message).toContain('código de barras ya está registrado');
    });
  });

  describe('Global Barcode Exact Match Priority Before Pagination', () => {
    it('prioritizes exact barcode match globally even if it would fall outside page 1 alphabetically', async () => {
      const targetBarcode = '779555';

      // Create 25 products that sort alphabetically BEFORE "Zebra Target" and have partial match on targetBarcode
      const alphaPrefixes = 'ABCDEFGHIJKLMNOPQRSTUVWXY'.split('');
      for (const char of alphaPrefixes) {
        await request(app.getHttpServer())
          .post('/api/products')
          .set('Cookie', ownerCookieA)
          .send({
            name: `${char} Parcial Contiene 779555`,
            barcode: `999${char}7795559`,
            salePriceCents: 10000,
          });
      }

      // Create exact barcode match with name starting with "Z" (which would normally be item #26 on page 2 when limit is 10)
      const exactProductRes = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Zebra Target Exact Barcode Match',
          barcode: targetBarcode,
          salePriceCents: 99000,
        });
      expect(exactProductRes.status).toBe(201);

      // Search with limit: 10, page: 1
      const searchRes = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA)
        .query({ q: targetBarcode, limit: 10, page: 1 });

      expect(searchRes.status).toBe(200);
      expect(searchRes.body.total).toBeGreaterThanOrEqual(26);
      expect(searchRes.body.items.length).toBe(10);
      // FIRST item MUST be the exact barcode match!
      expect(searchRes.body.items[0].barcode).toBe(targetBarcode);
      expect(searchRes.body.items[0].name).toBe('Zebra Target Exact Barcode Match');
    });
  });

  describe('Separation of Administrative Catalog vs Vendible POS Catalog', () => {
    it('excludes inactive, unavailable, and unconfigured products from POS while keeping them in Admin', async () => {
      // 1. Create configured & available product
      const p1 = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Producto Vendible Total',
          salePriceCents: 10000,
          initialStock: '10.0000',
        });
      expect(p1.status).toBe(201);

      // 2. Create product without ProductLocation for locationA (simulate by deleting ProductLocation)
      const p2 = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Producto Sin ProductLocation',
          salePriceCents: 20000,
        });
      await testPrisma.productLocation.deleteMany({ where: { productId: p2.body.id } });

      // 3. Create product with isAvailable=false in locationA
      const p3 = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Producto No Disponible en Sucursal',
          salePriceCents: 30000,
        });
      await request(app.getHttpServer())
        .patch(`/api/products/${p3.body.id}/location-settings`)
        .set('Cookie', ownerCookieA)
        .send({ isAvailable: false });

      // 4. Create product with isActive=false (globally inactive)
      const p4 = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Producto Globalmente Inactivo',
          salePriceCents: 40000,
        });
      await request(app.getHttpServer())
        .patch(`/api/products/${p4.body.id}`)
        .set('Cookie', ownerCookieA)
        .send({ isActive: false });

      // POS Query (onlyAvailable: true, Cashier or POS)
      const posRes = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', cashierCookieA);

      expect(posRes.status).toBe(200);
      const posNames = posRes.body.items.map((i: { name: string }) => i.name);
      expect(posNames).toContain('Producto Vendible Total');
      expect(posNames).not.toContain('Producto Sin ProductLocation');
      expect(posNames).not.toContain('Producto No Disponible en Sucursal');
      expect(posNames).not.toContain('Producto Globalmente Inactivo');

      // Cashier direct GET /:id checks
      const getUnconfigured = await request(app.getHttpServer())
        .get(`/api/products/${p2.body.id}`)
        .set('Cookie', cashierCookieA);
      expect(getUnconfigured.status).toBe(404);

      const getUnavailable = await request(app.getHttpServer())
        .get(`/api/products/${p3.body.id}`)
        .set('Cookie', cashierCookieA);
      expect(getUnavailable.status).toBe(404);

      const getInactive = await request(app.getHttpServer())
        .get(`/api/products/${p4.body.id}`)
        .set('Cookie', cashierCookieA);
      expect(getInactive.status).toBe(404);

      // Admin Query: can see everything when requested
      const adminAllRes = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA)
        .query({ includeInactive: true, onlyAvailable: false });

      const adminNames = adminAllRes.body.items.map((i: { name: string }) => i.name);
      expect(adminNames).toContain('Producto Vendible Total');
      expect(adminNames).toContain('Producto Sin ProductLocation');
      expect(adminNames).toContain('Producto No Disponible en Sucursal');
      expect(adminNames).toContain('Producto Globalmente Inactivo');

      // Admin filter by status
      const adminInactiveRes = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA)
        .query({ status: 'INACTIVE' });
      expect(adminInactiveRes.body.items.map((i: { name: string }) => i.name)).toEqual([
        'Producto Globalmente Inactivo',
      ]);
    });

    it('handles full lifecycle: active -> inactivate -> hidden in POS -> reactivate -> visible in POS', async () => {
      const p = await request(app.getHttpServer())
        .post('/api/products')
        .set('Cookie', ownerCookieA)
        .send({
          name: 'Alfajor Ciclo Vida',
          salePriceCents: 15000,
          initialStock: '20.0000',
        });
      const prodId = p.body.id;

      // 1. Initially visible in POS
      let posRes = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', cashierCookieA);
      expect(posRes.body.items.some((i: { id: string }) => i.id === prodId)).toBe(true);

      // 2. Deactivate globally
      await request(app.getHttpServer())
        .patch(`/api/products/${prodId}`)
        .set('Cookie', ownerCookieA)
        .send({ isActive: false });

      // 3. Hidden in POS
      posRes = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', cashierCookieA);
      expect(posRes.body.items.some((i: { id: string }) => i.id === prodId)).toBe(false);

      // 4. Visible in Admin with status=INACTIVE
      const adminRes = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA)
        .query({ status: 'INACTIVE' });
      expect(adminRes.body.items.some((i: { id: string }) => i.id === prodId)).toBe(true);

      // 5. Reactivate
      await request(app.getHttpServer())
        .patch(`/api/products/${prodId}`)
        .set('Cookie', ownerCookieA)
        .send({ isActive: true });

      // 6. Visible in POS again
      posRes = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', cashierCookieA);
      expect(posRes.body.items.some((i: { id: string }) => i.id === prodId)).toBe(true);
    });
  });

  describe('Catalog with > 100 Products and Server Pagination', () => {
    it('supports paginating and finding product 101 across pages', async () => {
      // Bulk insert 105 products directly into testPrisma for speed
      const productsData = [];
      for (let i = 1; i <= 105; i++) {
        const numStr = String(i).padStart(3, '0');
        productsData.push({
          id: `prod-bulk-${numStr}`,
          tenantId: tenantAId,
          name: `Bulk Product ${numStr}`,
          normalizedName: `bulk product ${numStr}`,
          barcode: `7799000${numStr}`,
          sku: `BLK-${numStr}`,
          salePriceCents: 1000 * i,
          unit: 'UNIT',
          isActive: true,
        });
      }
      await testPrisma.product.createMany({ data: productsData });

      // Also create ProductLocation for each to make them available in locationAId
      const locationsData = productsData.map((p) => ({
        productId: p.id,
        locationId: locationAId,
        stockQuantity: new Prisma.Decimal('50.0000'),
        minimumStock: new Prisma.Decimal('5.0000'),
        isAvailable: true,
        version: 1,
      }));
      await testPrisma.productLocation.createMany({ data: locationsData });

      // Test page 1 (50 items)
      const page1 = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA)
        .query({ page: 1, limit: 50 });
      expect(page1.status).toBe(200);
      expect(page1.body.total).toBe(105);
      expect(page1.body.page).toBe(1);
      expect(page1.body.limit).toBe(50);
      expect(page1.body.totalPages).toBe(3);
      expect(page1.body.items.length).toBe(50);

      // Test page 3 (items 101 to 105)
      const page3 = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA)
        .query({ page: 3, limit: 50 });
      expect(page3.status).toBe(200);
      expect(page3.body.items.length).toBe(5);
      expect(page3.body.items[0].name).toBe('Bulk Product 101');
      expect(page3.body.items[0].barcode).toBe('7799000101');

      // Test searching specifically for Product 101
      const searchP101 = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA)
        .query({ q: 'Product 101' });
      expect(searchP101.status).toBe(200);
      expect(searchP101.body.items[0].name).toBe('Bulk Product 101');

      // Test finding Product 101 by barcode
      const searchBarcode101 = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', cashierCookieA)
        .query({ barcode: '7799000101' });
      expect(searchBarcode101.status).toBe(200);
      expect(searchBarcode101.body.items[0].name).toBe('Bulk Product 101');
    });
  });

  describe('Dedicated Quick Slots Stability Regardless of Pagination & Filters', () => {
    it('returns all 8 quick slots even when assigned products sort outside page 1 alphabetically (> 100 products)', async () => {
      // 1. Create 100 products starting with "A..." to occupy page 1 and page 2
      const bulkItems = Array.from({ length: 100 }, (_, i) => ({
        id: `cuid_bulk_qs_${i + 1}`,
        tenantId: tenantAId,
        name: `A_Bulk_Item_${String(i + 1).padStart(3, '0')}`,
        normalizedName: `a_bulk_item_${String(i + 1).padStart(3, '0')}`,
        salePriceCents: 1000,
        unit: 'UNIT',
        isActive: true,
        barcode: `779955${String(i + 1).padStart(4, '0')}`,
      }));
      await testPrisma.product.createMany({ data: bulkItems });
      await testPrisma.productLocation.createMany({
        data: bulkItems.map((b) => ({
          productId: b.id,
          locationId: locationAId,
          stockQuantity: '10.0000',
          minimumStock: '2.0000',
          isAvailable: true,
          quickSlot: null,
          version: 1,
        })),
      });

      // 2. Create products starting with "Z..." assigned to quick slots 1..8 (would be on page 3 alphabetically)
      const slotProducts = Array.from({ length: 8 }, (_, i) => ({
        id: `cuid_z_slot_${i + 1}`,
        tenantId: tenantAId,
        name: `Z_Quick_Slot_Product_${i + 1}`,
        normalizedName: `z_quick_slot_product_${i + 1}`,
        salePriceCents: 2000,
        unit: 'UNIT',
        isActive: true,
        barcode: `779988000${i + 1}`,
      }));
      await testPrisma.product.createMany({ data: slotProducts });
      await testPrisma.productLocation.createMany({
        data: slotProducts.map((p, idx) => ({
          productId: p.id,
          locationId: locationAId,
          stockQuantity: '50.0000',
          minimumStock: '5.0000',
          isAvailable: true,
          quickSlot: idx + 1,
          version: 1,
        })),
      });

      // 3. Query GET /api/products on page 1 (limit 50) - none of the Z_Quick_Slot products are on page 1
      const page1Res = await request(app.getHttpServer())
        .get('/api/products')
        .set('Cookie', ownerCookieA)
        .query({ page: 1, limit: 50 });
      expect(page1Res.status).toBe(200);
      const page1QuickSlots = (page1Res.body.items as ProductResponse[]).filter(
        (it) => it.locationSettings?.quickSlot != null
      );
      expect(page1QuickSlots).toHaveLength(0);

      // 4. Query dedicated GET /api/products/quick-slots
      const quickSlotsRes = await request(app.getHttpServer())
        .get('/api/products/quick-slots')
        .set('Cookie', ownerCookieA);

      expect(quickSlotsRes.status).toBe(200);
      expect(quickSlotsRes.body).toHaveLength(8);
      for (let slot = 1; slot <= 8; slot++) {
        const item = (quickSlotsRes.body as ProductResponse[]).find(
          (p) => p.locationSettings?.quickSlot === slot
        );
        expect(item).toBeDefined();
        expect(item?.name).toBe(`Z_Quick_Slot_Product_${slot}`);
      }

      // 5. Cashier can also fetch quick slots
      const cashierQuickRes = await request(app.getHttpServer())
        .get('/api/products/quick-slots')
        .set('Cookie', cashierCookieA);

      expect(cashierQuickRes.status).toBe(200);
      expect(cashierQuickRes.body).toHaveLength(8);
    });
  });
});
