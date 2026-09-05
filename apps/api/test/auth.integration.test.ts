import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module.js';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { verifyPassword } from '../src/auth/security.utils.js';

function extractSessionCookie(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const found = cookies.find((c) => c.startsWith('pulso_session='));
  if (typeof found !== 'string') throw new Error('Expected pulso_session cookie was not found');
  return found;
}

function extractCookieValue(headers: Record<string, string | string[] | undefined>): string {
  const cookie = extractSessionCookie(headers);
  const part = cookie.split(';')[0];
  return part ?? '';
}

function extractRawToken(cookieHeader: string): string {
  const match = cookieHeader.match(/pulso_session=([^;]+)/);
  if (!match || !match[1]) throw new Error('Cannot extract token from cookie');
  return match[1];
}

import { RateLimiterService } from '../src/auth/rate-limiter.service.js';

describe('Auth & Identity Integration with Real PostgreSQL', () => {
  let app: INestApplication;

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
  });

  describe('POST /api/auth/register', () => {
    it('atomically creates User, Tenant, Location, TenantMembership, and Session in a single transaction', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco El Trébol',
          locationName: 'Casa Central',
          ownerName: 'Operador Mostrador',
          email: '  OPERADOR@example.COM  ',
          password: 'correct horse battery staple',
        })
        .expect(201);

      // Verify safe response shape (No secrets, no passwordHash, no tokenHash, no token in body)
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe('operador@example.com');
      expect(response.body.user.name).toBe('Operador Mostrador');
      expect(response.body.user.passwordHash).toBeUndefined();

      expect(response.body.tenant).toBeDefined();
      expect(response.body.tenant.name).toBe('Kiosco El Trébol');
      expect(response.body.tenant.slug).toBe('kiosco-el-trebol');

      expect(response.body.location).toBeDefined();
      expect(response.body.location.name).toBe('Casa Central');

      expect(response.body.role).toBe('OWNER');
      expect(response.body.expiresAt).toBeDefined();

      expect(response.body.token).toBeUndefined();
      expect(response.body.tokenHash).toBeUndefined();

      // Verify pulso_session cookie is set
      const sessionCookie = extractSessionCookie(response.headers);
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toContain('HttpOnly');
      expect(sessionCookie).toContain('Path=/');

      // Verify PostgreSQL state directly in real database
      const userInDb = await testPrisma.user.findUnique({
        where: { normalizedEmail: 'operador@example.com' },
      });
      expect(userInDb).not.toBeNull();
      expect(userInDb?.name).toBe('Operador Mostrador');
      expect(userInDb?.passwordHash.startsWith('$argon2id$')).toBe(true);

      const isValidPassword = await verifyPassword(
        userInDb!.passwordHash,
        'correct horse battery staple'
      );
      expect(isValidPassword).toBe(true);

      const tenantInDb = await testPrisma.tenant.findUnique({
        where: { slug: 'kiosco-el-trebol' },
      });
      expect(tenantInDb).not.toBeNull();

      const membership = await testPrisma.tenantMembership.findUnique({
        where: {
          tenantId_userId: {
            tenantId: tenantInDb!.id,
            userId: userInDb!.id,
          },
        },
      });
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('OWNER');

      const sessionInDb = await testPrisma.session.findFirst({
        where: { userId: userInDb!.id },
      });
      expect(sessionInDb).not.toBeNull();
      expect(sessionInDb?.tenantId).toBe(tenantInDb!.id);
      expect(sessionInDb?.tokenHash).toBeDefined();
      // Verify raw session token is NEVER stored in database
      const rawTokenFromCookie = extractRawToken(sessionCookie);
      expect(sessionInDb?.tokenHash).not.toBe(rawTokenFromCookie);
    });

    it('rejects registration with duplicate email with 409 Conflict without modifying database', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco El Trébol',
          locationName: 'Casa Central',
          ownerName: 'Operador Mostrador',
          email: 'operador@example.com',
          password: 'correct horse battery staple',
        })
        .expect(201);

      // Attempt duplicate registration with same email in different case
      const res = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco El Trébol 2',
          locationName: 'Sucursal 2',
          ownerName: 'Otro Propietario',
          email: '  OPERADOR@EXAMPLE.COM ',
          password: 'another valid password 123',
        })
        .expect(409);

      expect(res.body.message).toMatch(/correo|email/i);

      // Verify no duplicate user or orphaned second tenant exists
      const totalUsers = await testPrisma.user.count();
      const totalTenants = await testPrisma.tenant.count();
      expect(totalUsers).toBe(1);
      expect(totalTenants).toBe(1);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco Central',
          locationName: 'Sede 1',
          ownerName: 'Valeria Gómez',
          email: 'valeria@pulso.app',
          password: 'passwordSegura1234',
        })
        .expect(201);
    });

    it('logs in successfully with valid credentials and sets session cookie', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: '  VALERIA@PULSO.APP  ',
          password: 'passwordSegura1234',
        })
        .expect(200);

      expect(response.body.user.email).toBe('valeria@pulso.app');
      expect(response.body.tenant.name).toBe('Kiosco Central');
      expect(response.body.role).toBe('OWNER');

      const sessionCookie = extractSessionCookie(response.headers);
      expect(sessionCookie).toBeDefined();
    });

    it('returns generic 401 on invalid password without user enumeration', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'valeria@pulso.app',
          password: 'incorrectPassword999',
        })
        .expect(401);

      expect(response.body.message).toBe('Credenciales inválidas');
    });

    it('returns generic 401 on non-existent email without user enumeration', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@pulso.app',
          password: 'passwordSegura1234',
        })
        .expect(401);

      expect(response.body.message).toBe('Credenciales inválidas');
    });

    it('returns 401 if user status is DISABLED', async () => {
      await testPrisma.user.updateMany({
        where: { normalizedEmail: 'valeria@pulso.app' },
        data: { status: 'DISABLED' },
      });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'valeria@pulso.app',
          password: 'passwordSegura1234',
        })
        .expect(401);
    });

    it('returns 401 if tenant membership status is DISABLED', async () => {
      const user = await testPrisma.user.findUnique({
        where: { normalizedEmail: 'valeria@pulso.app' },
      });
      await testPrisma.tenantMembership.updateMany({
        where: { userId: user!.id },
        data: { status: 'DISABLED' },
      });

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'valeria@pulso.app',
          password: 'passwordSegura1234',
        })
        .expect(401);
    });
  });

  describe('GET /api/auth/me and POST /api/auth/logout', () => {
    let validCookie: string;

    beforeEach(async () => {
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco Me Test',
          locationName: 'Sucursal Me',
          ownerName: 'Lucía Méndez',
          email: 'lucia@example.com',
          password: 'superSecretPassword123',
        })
        .expect(201);

      validCookie = extractCookieValue(reg.headers);
    });

    it('returns safe current session details when authenticated', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', [validCookie])
        .expect(200);

      expect(response.body.user.email).toBe('lucia@example.com');
      expect(response.body.tenant.name).toBe('Kiosco Me Test');
      expect(response.body.location.name).toBe('Sucursal Me');
      expect(response.body.role).toBe('OWNER');
      expect(response.body.user.passwordHash).toBeUndefined();
    });

    it('rejects /api/auth/me without cookie with 401', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('rejects /api/auth/me with invalid or forged cookie with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', ['pulso_session=forged_token_that_does_not_exist'])
        .expect(401);
    });

    it('revokes session on logout, clears cookie, and prevents further authenticated requests', async () => {
      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [validCookie])
        .expect(200);

      expect(logoutRes.body.success).toBe(true);

      // Verify cookie cleared
      const clearedCookie = extractSessionCookie(logoutRes.headers);
      expect(clearedCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/);

      // Subsequent /api/auth/me with that token must be rejected
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', [validCookie])
        .expect(401);
    });

    it('rejects /api/auth/me when session has expired', async () => {
      // Fast-forward expiration in database
      await testPrisma.session.updateMany({
        data: {
          expiresAt: new Date(Date.now() - 10000), // 10 seconds ago
        },
      });

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Cookie', [validCookie])
        .expect(401);
    });
  });

  describe('Concurrent Registration & Race Condition Hardening', () => {
    it('concurrent registrations with the same email produce exactly one 201 and one 409, never 500', async () => {
      const payload1 = {
        businessName: 'Kiosco Alpha Concurrent',
        locationName: 'Central',
        ownerName: 'Alice Operadora',
        email: 'concurrent-race@pulso.dev',
        password: 'passwordSegura123!',
      };

      const payload2 = {
        businessName: 'Kiosco Beta Concurrent',
        locationName: 'Central',
        ownerName: 'Bob Operador',
        email: 'concurrent-race@pulso.dev',
        password: 'passwordSegura123!',
      };

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post('/api/auth/register').send(payload1),
        request(app.getHttpServer()).post('/api/auth/register').send(payload2),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 409]);

      // Exactly 1 user in PostgreSQL
      const usersInDb = await testPrisma.user.findMany({
        where: { normalizedEmail: 'concurrent-race@pulso.dev' },
      });
      expect(usersInDb.length).toBe(1);
    });

    it('concurrent registrations with the same business name resolve slug collisions cleanly without errors', async () => {
      const payload1 = {
        businessName: 'Kiosco El Repetido',
        locationName: 'Central',
        ownerName: 'Owner 1',
        email: 'repetido1@pulso.dev',
        password: 'passwordSegura123!',
      };

      const payload2 = {
        businessName: 'Kiosco El Repetido',
        locationName: 'Central',
        ownerName: 'Owner 2',
        email: 'repetido2@pulso.dev',
        password: 'passwordSegura123!',
      };

      const [res1, res2] = await Promise.all([
        request(app.getHttpServer()).post('/api/auth/register').send(payload1),
        request(app.getHttpServer()).post('/api/auth/register').send(payload2),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.tenant.slug).not.toBe(res2.body.tenant.slug);
      expect(res1.body.tenant.slug).toMatch(/^kiosco-el-repetido(-[0-9]+)?$/);
      expect(res2.body.tenant.slug).toMatch(/^kiosco-el-repetido(-[0-9]+)?$/);
    });
  });

  describe('Session Hardening & Negative Inconsistency Rejection', () => {
    it('rejects /api/auth/me when the location has been deactivated', async () => {
      // Register business
      const reg = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco Inactive Test',
          locationName: 'Central Inactiva',
          ownerName: 'Dueño Inactivo',
          email: 'inactiva@pulso.dev',
          password: 'passwordSegura123!',
        })
        .expect(201);

      const cookie = extractCookieValue(reg.headers);
      const locationId = reg.body.location.id;

      // Deactivate branch in PostgreSQL
      await testPrisma.location.update({
        where: { id: locationId },
        data: { isActive: false },
      });

      // Verification must now fail
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', [cookie]).expect(401);
    });

    it('rejects /api/auth/me when the location belongs to a different tenant', async () => {
      // Register Business A
      const regA = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco Tenant A',
          locationName: 'Sucursal A',
          ownerName: 'Dueño A',
          email: 'tenanta@pulso.dev',
          password: 'passwordSegura123!',
        })
        .expect(201);

      // Register Business B
      const regB = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco Tenant B',
          locationName: 'Sucursal B',
          ownerName: 'Dueño B',
          email: 'tenantb@pulso.dev',
          password: 'passwordSegura123!',
        })
        .expect(201);

      const cookieA = extractCookieValue(regA.headers);
      const locationBId = regB.body.location.id;

      // Tamper session in database: point Tenant A session to Tenant B's location
      await testPrisma.session.updateMany({
        where: { userId: regA.body.user.id },
        data: { locationId: locationBId },
      });

      // Session must be rejected with 401 due to tenant/location mismatch
      await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', [cookieA]).expect(401);
    });
  });

  describe('Brute Force Protection & Rate Limiting', () => {
    it('returns HTTP 429 Too Many Requests when login limit is exceeded', async () => {
      // Execute 5 rapid login attempts
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({
            email: 'bruteforce@pulso.dev',
            password: 'wrongPassword',
          })
          .expect(401);
      }

      // 6th attempt must be rejected with 429
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'bruteforce@pulso.dev',
          password: 'wrongPassword',
        })
        .expect(429);

      expect(response.body.message).toContain('Demasiados intentos');
    });

    it('returns HTTP 429 when register limit is exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/auth/register')
          .send({
            businessName: `Kiosco Limiter ${i}`,
            locationName: 'Central',
            ownerName: 'Owner',
            email: `limiter${i}@pulso.dev`,
            password: 'passwordSegura123!',
          })
          .expect(201);
      }

      // 6th registration from same IP must receive 429
      const response = await request(app.getHttpServer())
        .post('/api/auth/register')
        .send({
          businessName: 'Kiosco Limiter Exceeded',
          locationName: 'Central',
          ownerName: 'Owner',
          email: 'limiterexceeded@pulso.dev',
          password: 'passwordSegura123!',
        })
        .expect(429);

      expect(response.body.message).toContain('Demasiados intentos');
    });
  });

  describe('Origin Validation & Cross-Origin Mutation Guard', () => {
    it('rejects state-changing requests from disallowed origins with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', 'http://malicious-cross-origin.com')
        .send({
          email: 'test@pulso.dev',
          password: 'passwordSegura123!',
        })
        .expect(403);
    });

    it('allows requests with recognized local dev origins', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('Origin', 'http://localhost:3000')
        .send({
          email: 'test@pulso.dev',
          password: 'passwordSegura123!',
        });

      // Should not be 403 (expected 401 because user doesn't exist, proving origin passed)
      expect(response.status).toBe(401);
    });
  });
});
