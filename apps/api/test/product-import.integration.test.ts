import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { RateLimiterService } from '../src/auth/rate-limiter.service.js';
import { hashPassword } from '../src/auth/security.utils.js';
import { testPrisma, truncateAllTables } from './setup-test-db.js';

process.env.PRODUCT_IMPORT_PREVIEW_SECRET = 'test-only-product-import-preview-secret-32-bytes';

function cookie(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const value = values.find((candidate) => candidate.startsWith('pulso_session='))?.split(';')[0];
  if (!value) throw new Error('Expected session cookie');
  return value;
}

describe('Product import preview integration', () => {
  let app: INestApplication;
  let ownerA: string;
  let managerA: string;
  let cashierA: string;
  let ownerB: string;
  let tenantAId: string;
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

    const registrationA = await request(app.getHttpServer()).post('/api/auth/register').send({
      businessName: 'Tenant A',
      locationName: 'Central',
      ownerName: 'Owner A',
      email: 'owner-a@pulso.dev',
      password: 'Password123!',
    });
    ownerA = cookie(registrationA.headers);
    tenantAId = registrationA.body.tenant.id;
    locationAId = registrationA.body.location.id;

    async function staff(role: 'MANAGER' | 'CASHIER', email: string): Promise<string> {
      const user = await testPrisma.user.create({
        data: {
          email,
          normalizedEmail: email,
          name: role,
          passwordHash: await hashPassword('Password123!'),
        },
      });
      const membership = await testPrisma.tenantMembership.create({
        data: {
          tenantId: tenantAId,
          userId: user.id,
          role,
        },
      });
      await testPrisma.membershipLocation.create({
        data: {
          tenantId: tenantAId,
          membershipId: membership.id,
          locationId: locationAId,
        },
      });
      const login = await request(app.getHttpServer()).post('/api/auth/login').send({
        email,
        password: 'Password123!',
      });
      return cookie(login.headers);
    }
    managerA = await staff('MANAGER', 'manager-a@pulso.dev');
    cashierA = await staff('CASHIER', 'cashier-a@pulso.dev');

    const registrationB = await request(app.getHttpServer()).post('/api/auth/register').send({
      businessName: 'Tenant B',
      locationName: 'North',
      ownerName: 'Owner B',
      email: 'owner-b@pulso.dev',
      password: 'Password123!',
    });
    ownerB = cookie(registrationB.headers);
  });

  const preview = (sessionCookie: string, csv: string) =>
    request(app.getHttpServer())
      .post('/api/products/import/preview')
      .set('Cookie', sessionCookie)
      .attach('file', Buffer.from(csv), { filename: 'products.csv', contentType: 'text/csv' });

  const commit = (sessionCookie: string, previewToken: string) =>
    request(app.getHttpServer())
      .post('/api/products/import/commit')
      .set('Cookie', sessionCookie)
      .send({ previewToken, confirmation: true });

  it('allows OWNER and MANAGER, returns a contract-valid preview, and never mutates catalog data', async () => {
    await request(app.getHttpServer()).post('/api/products').set('Cookie', ownerB).send({
      name: 'Cross tenant product',
      barcode: 'CROSS-1',
      salePriceCents: 1000,
    });
    const csv =
      'name,category,barcode,salePriceCents,initialStock,quickSlot\nYerba,Nueva,CROSS-1,2500,3,2';

    for (const allowedCookie of [ownerA, managerA]) {
      const response = await preview(allowedCookie, csv);
      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({
          canCommit: true,
          summary: { total: 1, valid: 1, invalid: 0, createdCategories: 1 },
        })
      );
      expect(response.body.previewToken).toEqual(expect.any(String));
      expect(response.body.rows[0]).toEqual(
        expect.objectContaining({
          name: 'Yerba',
          category: 'Nueva',
          barcode: 'CROSS-1',
          initialStock: '3.0000',
          quickSlot: 2,
        })
      );
    }

    expect(await testPrisma.product.count({ where: { tenantId: tenantAId } })).toBe(0);
    expect(await testPrisma.category.count({ where: { tenantId: tenantAId } })).toBe(0);
  });

  it('denies CASHIER before parsing and reports only same-tenant/location database conflicts', async () => {
    await request(app.getHttpServer()).post('/api/products').set('Cookie', ownerA).send({
      name: 'Existing',
      barcode: 'A-1',
      sku: 'SKU-1',
      salePriceCents: 1000,
      quickSlot: 1,
    });
    const csv = 'name,barcode,sku,salePriceCents,quickSlot\nExisting,A-1,SKU-1,2000,1';

    const forbidden = await preview(cashierA, csv);
    expect(forbidden.status).toBe(403);

    const response = await preview(ownerA, csv);
    expect(response.status).toBe(201);
    expect(response.body.canCommit).toBe(false);
    expect(response.body.summary).toEqual({ total: 1, valid: 0, invalid: 1, createdCategories: 0 });
    expect(
      response.body.errors.map((error: { field?: string; code: string }) => [
        error.field,
        error.code,
      ])
    ).toEqual([
      ['name', 'DATABASE_DUPLICATE'],
      ['barcode', 'DATABASE_DUPLICATE'],
      ['sku', 'DATABASE_DUPLICATE'],
      ['quickSlot', 'SLOT_OCCUPIED'],
    ]);
  });

  it('commits categories, products, location stock, INITIAL movements and a summary audit atomically', async () => {
    const previewResponse = await preview(
      ownerA,
      'name,category,barcode,salePriceCents,initialStock,minimumStock,quickSlot\nYerba,Almacén,Y-1,2500,3,1,2\nAgua,Almacén,A-1,1000,0,2,3'
    );

    const response = await commit(ownerA, previewResponse.body.previewToken);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({
      importedCount: 2,
      categoryCount: 1,
      auditId: expect.any(String),
    });
    expect(await testPrisma.product.count({ where: { tenantId: tenantAId } })).toBe(2);
    expect(await testPrisma.category.count({ where: { tenantId: tenantAId } })).toBe(1);
    expect(await testPrisma.productLocation.count({ where: { locationId: locationAId } })).toBe(2);
    expect(
      await testPrisma.inventoryMovement.count({
        where: { tenantId: tenantAId, locationId: locationAId, type: 'INITIAL' },
      })
    ).toBe(1);
    expect(
      await testPrisma.productImportAudit.findUnique({ where: { id: response.body.auditId } })
    ).toEqual(
      expect.objectContaining({
        tenantId: tenantAId,
        locationId: locationAId,
        result: 'SUCCESS',
        fileName: 'products.csv',
        totalRows: 2,
        importedCount: 2,
        categoryCount: 1,
      })
    );
  });

  it('is idempotent for sequential and concurrent replay of the same signed preview', async () => {
    const previewResponse = await preview(
      managerA,
      'name,barcode,salePriceCents,initialStock\nGalletitas,G-1,900,4'
    );
    const token = previewResponse.body.previewToken;

    const [first, second] = await Promise.all([commit(managerA, token), commit(managerA, token)]);
    const replay = await commit(managerA, token);

    expect([first.status, second.status, replay.status]).toEqual([201, 201, 201]);
    expect(second.body).toEqual(first.body);
    expect(replay.body).toEqual(first.body);
    expect(await testPrisma.product.count({ where: { tenantId: tenantAId } })).toBe(1);
    expect(await testPrisma.productImportAudit.count({ where: { tenantId: tenantAId } })).toBe(1);
  });

  it('revalidates concurrent duplicates, rejects the full import, audits the rejection, and keeps RBAC', async () => {
    const csv = 'name,barcode,salePriceCents\nConcurrente,C-1,1000';
    const previewResponse = await preview(ownerA, csv);
    await request(app.getHttpServer()).post('/api/products').set('Cookie', ownerA).send({
      name: 'Concurrente',
      barcode: 'C-1',
      salePriceCents: 1000,
    });

    expect((await commit(cashierA, previewResponse.body.previewToken)).status).toBe(403);
    const response = await commit(ownerA, previewResponse.body.previewToken);

    expect(response.status).toBe(409);
    expect(response.body.message).toContain('conflictos');
    expect(await testPrisma.product.count({ where: { tenantId: tenantAId } })).toBe(1);
    expect(
      await testPrisma.productImportAudit.findFirst({ where: { tenantId: tenantAId } })
    ).toEqual(expect.objectContaining({ result: 'REJECTED', importedCount: 0, totalRows: 1 }));
  });

  it('rolls back every catalog write when a persistence failure is injected', async () => {
    await testPrisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_product_import_test() RETURNS trigger AS $$
      BEGIN
        IF NEW.name = 'Falla forzada' THEN RAISE EXCEPTION 'injected import failure'; END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await testPrisma.$executeRawUnsafe(`
      CREATE TRIGGER product_import_failure BEFORE INSERT ON products
      FOR EACH ROW EXECUTE FUNCTION fail_product_import_test()
    `);
    try {
      const previewResponse = await preview(
        ownerA,
        'name,category,barcode,salePriceCents,initialStock\nPrimero,Nueva,P-1,1000,2\nFalla forzada,Nueva,F-1,1200,3'
      );

      const response = await commit(ownerA, previewResponse.body.previewToken);

      expect(response.status).toBe(409);
      expect(await testPrisma.product.count({ where: { tenantId: tenantAId } })).toBe(0);
      expect(await testPrisma.category.count({ where: { tenantId: tenantAId } })).toBe(0);
      expect(await testPrisma.productLocation.count({ where: { locationId: locationAId } })).toBe(
        0
      );
      expect(await testPrisma.inventoryMovement.count({ where: { tenantId: tenantAId } })).toBe(0);
      expect(
        await testPrisma.productImportAudit.findFirst({ where: { tenantId: tenantAId } })
      ).toEqual(expect.objectContaining({ result: 'REJECTED', importedCount: 0, totalRows: 2 }));
    } finally {
      await testPrisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS product_import_failure ON products'
      );
      await testPrisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fail_product_import_test()');
    }
  });
});
