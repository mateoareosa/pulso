import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { RateLimiterService } from '../src/auth/rate-limiter.service.js';
import {
  hashPassword,
  hashSessionToken,
  generateSessionToken,
  normalizeEmail,
} from '../src/auth/security.utils.js';

function extractCookieValue(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = cookies.find((c) => c.startsWith('pulso_session='));
  if (typeof found !== 'string') throw new Error('Expected pulso_session cookie was not found');
  const part = found.split(';')[0];
  return part ?? '';
}

describe('Multi-Tenant Isolation & Negative Authorization', () => {
  let app: INestApplication;
  let cookieTenantA: string;
  let cookieTenantB: string;
  let tenantAId: string;
  let tenantBId: string;
  let locationAId: string;
  let locationBId: string;

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

    // Register Tenant A
    const regA = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        businessName: 'Kiosco Alpha',
        locationName: 'Sucursal Alpha Centro',
        ownerName: 'Alice Propietaria',
        email: 'alice@alpha.com',
        password: 'passwordSeguraAlpha123',
      })
      .expect(201);

    tenantAId = regA.body.tenant.id;
    locationAId = regA.body.location.id;
    cookieTenantA = extractCookieValue(regA.headers);

    // Register Tenant B
    const regB = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        businessName: 'Kiosco Beta',
        locationName: 'Sucursal Beta Norte',
        ownerName: 'Bob Propietario',
        email: 'bob@beta.com',
        password: 'passwordSeguraBeta123',
      })
      .expect(201);

    tenantBId = regB.body.tenant.id;
    locationBId = regB.body.location.id;
    cookieTenantB = extractCookieValue(regB.headers);
  });

  describe('Locations Multi-Tenant Isolation', () => {
    it('User A only receives locations belonging to Tenant A', async () => {
      const resA = await request(app.getHttpServer())
        .get('/api/locations')
        .set('Cookie', [cookieTenantA])
        .expect(200);

      expect(resA.body).toBeInstanceOf(Array);
      expect(resA.body.length).toBe(1);
      expect(resA.body[0].tenantId).toBe(tenantAId);
      expect(resA.body[0].name).toBe('Sucursal Alpha Centro');
    });

    it('User B only receives locations belonging to Tenant B', async () => {
      const resB = await request(app.getHttpServer())
        .get('/api/locations')
        .set('Cookie', [cookieTenantB])
        .expect(200);

      expect(resB.body).toBeInstanceOf(Array);
      expect(resB.body.length).toBe(1);
      expect(resB.body[0].tenantId).toBe(tenantBId);
      expect(resB.body[0].name).toBe('Sucursal Beta Norte');
    });

    it('Negative Test: Injecting foreign tenantId in headers or query does NOT change tenant context', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/locations?tenantId=${tenantBId}`)
        .set('Cookie', [cookieTenantA])
        .set('x-tenant-id', tenantBId)
        .expect(200);

      // Must still strictly return Tenant A locations, completely ignoring spoofed tenantId
      expect(res.body.length).toBe(1);
      expect(res.body[0].tenantId).toBe(tenantAId);
      expect(res.body[0].name).toBe('Sucursal Alpha Centro');
    });
  });

  describe('Sales Multi-Tenant Isolation & Injection Rejection', () => {
    it('strictly rejects client payloads attempting to inject tenantId or locationId with 400 Bad Request', async () => {
      const injectedPayload = {
        tenantId: tenantBId, // Malicious attempt to inject foreign tenant
        locationId: 'spoofed-location',
        shiftId: 'shift-1',
        idempotencyKey: '11111111-1111-4111-a111-111111111111',
        items: [
          {
            productId: 'prod-1',
            name: 'Alfajor',
            quantity: 1,
            unitPriceCents: 100000,
            totalPriceCents: 100000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100000 }],
        totalCents: 100000,
        createdAtUtc: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', [cookieTenantA])
        .send(injectedPayload)
        .expect(400);

      expect(res.body.message).toContain('Invalid sales payload schema');
    });

    it('processes valid sale without tenantId/locationId and strictly derives them from verified session', async () => {
      const validPayload = {
        shiftId: 'shift-1',
        idempotencyKey: '11111111-1111-4111-a111-111111111111',
        items: [
          {
            productId: 'prod-1',
            name: 'Alfajor',
            quantity: 1,
            unitPriceCents: 100000,
            totalPriceCents: 100000,
          },
        ],
        tenders: [{ type: 'CASH', amountCents: 100000 }],
        totalCents: 100000,
        createdAtUtc: new Date().toISOString(),
      };

      const res = await request(app.getHttpServer())
        .post('/api/sales')
        .set('Cookie', [cookieTenantA])
        .send(validPayload)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.sale.tenantId).toBe(tenantAId);
      expect(res.body.sale.locationId).toBe(locationAId);
      expect(res.body.sale.tenantId).not.toBe(tenantBId);
    });

    it('Negative Test: Reject unauthenticated sales attempts with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/sales')
        .send({
          idempotencyKey: '22222222-2222-4222-a222-222222222222',
        })
        .expect(401);
    });
  });

  describe('Sync Batch Multi-Tenant Isolation & Injection Rejection', () => {
    const validSalePayload = {
      shiftId: 'shift-100',
      idempotencyKey: '33333333-3333-4333-a333-333333333333',
      items: [
        {
          productId: 'prod-001',
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

    it('rejects sync batch with injected tenantId/locationId at root with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/sync/batch')
        .set('Cookie', [cookieTenantA])
        .send({
          deviceId: 'dev-01',
          tenantId: tenantBId,
          operations: [
            {
              operationId: '44444444-4444-4444-a444-444444444444',
              type: 'CREATE_SALE',
              payload: validSalePayload,
            },
          ],
        })
        .expect(400);
    });

    it('rejects sync batch with injected tenantId/locationId inside an operation with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/sync/batch')
        .set('Cookie', [cookieTenantA])
        .send({
          deviceId: 'dev-01',
          operations: [
            {
              operationId: '44444444-4444-4444-a444-444444444444',
              type: 'CREATE_SALE',
              locationId: locationBId,
              payload: validSalePayload,
            },
          ],
        })
        .expect(400);
    });

    it('rejects sync batch with injected tenantId/locationId inside the sale payload with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .post('/api/sync/batch')
        .set('Cookie', [cookieTenantA])
        .send({
          deviceId: 'dev-01',
          operations: [
            {
              operationId: '44444444-4444-4444-a444-444444444444',
              type: 'CREATE_SALE',
              payload: {
                ...validSalePayload,
                tenantId: tenantBId,
              },
            },
          ],
        })
        .expect(400);
    });

    it('processes valid sync batch and strictly derives tenantId/locationId from session', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/sync/batch')
        .set('Cookie', [cookieTenantA])
        .send({
          deviceId: 'dev-01',
          operations: [
            {
              operationId: '55555555-5555-4555-a555-555555555555',
              type: 'CREATE_SALE',
              payload: validSalePayload,
            },
          ],
        })
        .expect(200);

      expect(res.body.syncedCount).toBe(1);
      expect(res.body.results[0].status).toBe('SYNCED');
      expect(res.body.results[0].tenantId).toBe(tenantAId);
      expect(res.body.results[0].locationId).toBe(locationAId);
      expect(res.body.results[0].tenantId).not.toBe(tenantBId);
    });
  });

  describe('Role-Based Authorization (RBAC) & Least Privilege', () => {
    it('denies CASHIER role from creating locations with 403 Forbidden', async () => {
      // Create a cashier in Tenant A
      const cashierEmail = 'cajero@alpha.com';
      const cashierUser = await testPrisma.user.create({
        data: {
          email: cashierEmail,
          normalizedEmail: normalizeEmail(cashierEmail),
          name: 'Carlos Cajero',
          passwordHash: await hashPassword('passwordSegura123!'),
        },
      });

      await testPrisma.tenantMembership.create({
        data: {
          tenantId: tenantAId,
          userId: cashierUser.id,
          role: 'CASHIER',
        },
      });

      const cashierToken = generateSessionToken();
      await testPrisma.session.create({
        data: {
          userId: cashierUser.id,
          tenantId: tenantAId,
          locationId: locationAId,
          tokenHash: hashSessionToken(cashierToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      // Attempt to create location as cashier -> must return 403 Forbidden
      await request(app.getHttpServer())
        .post('/api/locations')
        .set('Cookie', [`pulso_session=${cashierToken}`])
        .send({ name: 'Sucursal No Autorizada' })
        .expect(403);
    });

    it('permits OWNER role to create new locations', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/locations')
        .set('Cookie', [cookieTenantA])
        .send({ name: 'Sucursal Alpha Sur', address: 'Av. Libertador 1234' })
        .expect(201);

      expect(res.body.name).toBe('Sucursal Alpha Sur');
      expect(res.body.address).toBe('Av. Libertador 1234');
      expect(res.body.tenantId).toBe(tenantAId);
    });

    it('permits MANAGER role to create new locations', async () => {
      const managerEmail = 'encargado@alpha.com';
      const managerUser = await testPrisma.user.create({
        data: {
          email: managerEmail,
          normalizedEmail: normalizeEmail(managerEmail),
          name: 'Elena Encargada',
          passwordHash: await hashPassword('passwordSegura123!'),
        },
      });

      await testPrisma.tenantMembership.create({
        data: {
          tenantId: tenantAId,
          userId: managerUser.id,
          role: 'MANAGER',
        },
      });

      const managerToken = generateSessionToken();
      await testPrisma.session.create({
        data: {
          userId: managerUser.id,
          tenantId: tenantAId,
          locationId: locationAId,
          tokenHash: hashSessionToken(managerToken),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .post('/api/locations')
        .set('Cookie', [`pulso_session=${managerToken}`])
        .send({ name: 'Sucursal Alpha Oeste', address: 'Calle 50 #123' })
        .expect(201);

      expect(res.body.name).toBe('Sucursal Alpha Oeste');
      expect(res.body.tenantId).toBe(tenantAId);
    });

    describe('POST /api/locations Input Contract Validation', () => {
      it('rejects numeric address with 400 Bad Request (never 500)', async () => {
        const res = await request(app.getHttpServer())
          .post('/api/locations')
          .set('Cookie', [cookieTenantA])
          .send({ name: 'Sucursal Error', address: 12345 })
          .expect(400);

        expect(res.body.message).toContain('Datos de sucursal inválidos');
      });

      it('rejects empty name with 400 Bad Request', async () => {
        await request(app.getHttpServer())
          .post('/api/locations')
          .set('Cookie', [cookieTenantA])
          .send({ name: '   ', address: 'Av. Libertador 1234' })
          .expect(400);
      });

      it('rejects names exceeding 100 characters with 400 Bad Request', async () => {
        await request(app.getHttpServer())
          .post('/api/locations')
          .set('Cookie', [cookieTenantA])
          .send({ name: 'A'.repeat(101) })
          .expect(400);
      });

      it('rejects address exceeding 255 characters with 400 Bad Request', async () => {
        await request(app.getHttpServer())
          .post('/api/locations')
          .set('Cookie', [cookieTenantA])
          .send({ name: 'Sucursal Test', address: 'B'.repeat(256) })
          .expect(400);
      });

      it('rejects unknown fields with 400 Bad Request', async () => {
        await request(app.getHttpServer())
          .post('/api/locations')
          .set('Cookie', [cookieTenantA])
          .send({ name: 'Sucursal Test', unknownField: true })
          .expect(400);
      });

      it('strictly rejects attempt to inject tenantId with 400 Bad Request', async () => {
        await request(app.getHttpServer())
          .post('/api/locations')
          .set('Cookie', [cookieTenantA])
          .send({ name: 'Sucursal Inyectada', tenantId: tenantBId })
          .expect(400);
      });
    });
  });
});
