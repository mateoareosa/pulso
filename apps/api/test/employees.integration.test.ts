import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module.js';
import { RateLimiterService } from '../src/auth/rate-limiter.service.js';
import { testPrisma, truncateAllTables } from './setup-test-db.js';
import { generateSessionToken, hashSessionToken } from '../src/auth/security.utils.js';

function sessionCookie(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers['set-cookie'];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = values.find((value) => value.startsWith('pulso_session='));
  if (!cookie) throw new Error('Expected pulso_session cookie');
  return cookie.split(';')[0] ?? '';
}

describe('Employees administration', () => {
  let app: INestApplication;
  let ownerCookie: string;
  let ownerId: string;
  let tenantId: string;
  let locationId: string;

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
    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        businessName: 'Pulso Demo',
        locationName: 'Centro',
        ownerName: 'Owner Uno',
        email: 'owner@example.com',
        password: 'OwnerPassword123!',
      })
      .expect(201);
    ownerCookie = sessionCookie(registered.headers);
    ownerId = registered.body.user.id;
    tenantId = registered.body.tenant.id;
    locationId = registered.body.location.id;
  });

  async function invite(email = 'employee@example.com') {
    return await request(app.getHttpServer())
      .post('/api/employees/invitations')
      .set('Cookie', [ownerCookie])
      .send({ email, name: 'Empleado Dos', role: 'CASHIER', locationIds: [locationId] });
  }

  it('rejects unauthenticated and non-owner employee administration', async () => {
    await request(app.getHttpServer()).get('/api/employees').expect(401);
    const employee = await invite();
    const membership = await testPrisma.tenantMembership.findUniqueOrThrow({
      where: { id: employee.body.employee.id },
    });
    await testPrisma.tenantMembership.update({ where: { id: membership.id }, data: { status: 'ACTIVE' } });
    const token = generateSessionToken();
    await testPrisma.session.create({
      data: { userId: membership.userId, tenantId, membershipId: membership.id, locationId, credentialVersion: 1, membershipAccessVersion: membership.accessVersion, tokenHash: hashSessionToken(token), expiresAt: new Date(Date.now() + 60000) },
    });
    await request(app.getHttpServer()).get('/api/employees').set('Cookie', [`pulso_session=${token}`]).expect(403);
  });

  it('validates employee payloads and rejects unavailable locations', async () => {
    await request(app.getHttpServer()).post('/api/employees/invitations').set('Cookie', [ownerCookie]).send({ email: 'bad', name: 'x', role: 'CASHIER', locationIds: [locationId, locationId] }).expect(400);
    const foreign = await request(app.getHttpServer()).post('/api/auth/register').send({ businessName: 'Otro', locationName: 'Otra', ownerName: 'Otro Owner', email: 'other@example.com', password: 'OtherPassword123!' }).expect(201);
    await request(app.getHttpServer()).post('/api/employees/invitations').set('Cookie', [ownerCookie]).send({ email: 'cross@example.com', name: 'Cross Tenant', role: 'CASHIER', locationIds: [foreign.body.location.id] }).expect(409);
    const inactiveLocation = await testPrisma.location.create({ data: { tenantId, name: 'Sucursal Inactiva', isActive: false } });
    await request(app.getHttpServer()).post('/api/employees/invitations').set('Cookie', [ownerCookie]).send({ email: 'inactive@example.com', name: 'Inactive Location', role: 'CASHIER', locationIds: [inactiveLocation.id] }).expect(409);
  });

  it('allows only OWNER sessions and never lists another tenant memberships', async () => {
    const invitation = await invite();
    expect(invitation.status).toBe(201);
    const membershipId = invitation.body.employee.id as string;

    const foreign = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        businessName: 'Tenant Ajeno',
        locationName: 'Norte',
        ownerName: 'Owner Ajeno',
        email: 'foreign@example.com',
        password: 'ForeignPassword123!',
      })
      .expect(201);
    const foreignCookie = sessionCookie(foreign.headers);

    const listed = await request(app.getHttpServer())
      .get('/api/employees')
      .set('Cookie', [ownerCookie])
      .expect(200);
    expect(listed.body.map((employee: { id: string }) => employee.id)).toContain(membershipId);
    expect(
      listed.body.some((employee: { email: string }) => employee.email === 'foreign@example.com')
    ).toBe(false);

    const membership = await testPrisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipId },
    });
    await testPrisma.tenantMembership.update({
      where: { id: membership.id },
      data: { role: 'MANAGER', status: 'ACTIVE' },
    });
    await request(app.getHttpServer())
      .get('/api/employees')
      .set('Cookie', [foreignCookie])
      .expect(200);

    const raw = generateSessionToken();
    await testPrisma.session.create({
      data: {
        userId: membership.userId,
        tenantId,
        membershipId,
        locationId,
        credentialVersion: 1,
        membershipAccessVersion: membership.accessVersion,
        tokenHash: hashSessionToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await request(app.getHttpServer())
      .get('/api/employees')
      .set('Cookie', [`pulso_session=${raw}`])
      .expect(403);
  });

  it('creates, resends, and cancels a hashed single-use invitation with safe audit metadata', async () => {
    const created = await invite(' INVITED@Example.com ');
    expect(created.status).toBe(201);
    expect(created.body.employee).toMatchObject({
      email: 'invited@example.com',
      status: 'INVITED',
      role: 'CASHIER',
    });
    const invitationUrl = new URL(created.body.action.url);
    expect(invitationUrl.pathname).toBe('/accept-invitation');
    expect(invitationUrl.search).toBe('');
    expect(invitationUrl.hash).toMatch(/^#token=[A-Za-z0-9_-]+$/);
    const membershipId = created.body.employee.id as string;
    const firstToken = await testPrisma.membershipActionToken.findFirstOrThrow({
      where: { membershipId, type: 'INVITE' },
    });
    expect(created.body.action.url).not.toContain(firstToken.tokenHash);

    const resent = await request(app.getHttpServer())
      .post(`/api/employees/invitations/${membershipId}/resend`)
      .set('Cookie', [ownerCookie])
      .send({ version: created.body.employee.version })
      .expect(201);
    expect(resent.body.action.url).not.toBe(created.body.action.url);
    expect(
      (await testPrisma.membershipActionToken.findUniqueOrThrow({ where: { id: firstToken.id } }))
        .revokedAt
    ).not.toBeNull();

    await request(app.getHttpServer())
      .post(`/api/employees/invitations/${membershipId}/cancel`)
      .set('Cookie', [ownerCookie])
      .send({ version: resent.body.employee.version })
      .expect(200);
    expect(
      (await testPrisma.tenantMembership.findUniqueOrThrow({ where: { id: membershipId } })).status
    ).toBe('DISABLED');
    const audits = await testPrisma.employeeAuditEvent.findMany({
      where: { tenantId, targetMembershipId: membershipId },
    });
    expect(audits).toHaveLength(3);
    expect(JSON.stringify(audits.map((event) => event.metadata))).not.toMatch(/token|hash/i);
    const auditResponse = await request(app.getHttpServer())
      .get('/api/employees/audit')
      .set('Cookie', [ownerCookie])
      .expect(200);
    expect(auditResponse.body.map((event: { action: string }) => event.action)).toEqual([
      'INVITED',
      'INVITED',
      'INVITED',
    ]);
    expect(auditResponse.body[0].metadata).toMatchObject({ operation: 'cancelled' });
  });

  it('reactivates a cancelled invitation without duplicating records and rotates its token', async () => {
    const created = await invite('reinvite@example.com');
    const membershipId = created.body.employee.id as string;
    const userId = created.body.employee.userId as string;
    const oldToken = decodeURIComponent(
      new URL(created.body.action.url).hash.slice('#token='.length)
    );

    const cancelled = await request(app.getHttpServer())
      .post(`/api/employees/invitations/${membershipId}/cancel`)
      .set('Cookie', [ownerCookie])
      .send({ version: created.body.employee.version })
      .expect(200);
    const cancelledMembership = await testPrisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipId },
    });
    const secondLocation = await testPrisma.location.create({
      data: { tenantId, name: 'Sucursal Norte' },
    });

    const reinvited = await request(app.getHttpServer())
      .post('/api/employees/invitations')
      .set('Cookie', [ownerCookie])
      .send({
        email: ' REINVITE@example.com ',
        name: 'Nombre Actualizado',
        role: 'MANAGER',
        locationIds: [secondLocation.id],
      })
      .expect(201);
    const newToken = decodeURIComponent(
      new URL(reinvited.body.action.url).hash.slice('#token='.length)
    );

    expect(reinvited.body.employee).toMatchObject({
      id: membershipId,
      userId,
      email: 'reinvite@example.com',
      name: 'Nombre Actualizado',
      role: 'MANAGER',
      status: 'INVITED',
      locationIds: [secondLocation.id],
      version: cancelled.body.version + 1,
    });
    expect(
      await testPrisma.user.count({ where: { normalizedEmail: 'reinvite@example.com' } })
    ).toBe(1);
    expect(await testPrisma.tenantMembership.count({ where: { tenantId, userId } })).toBe(1);

    const reactivatedMembership = await testPrisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipId },
    });
    expect(reactivatedMembership.accessVersion).toBe(cancelledMembership.accessVersion + 1);

    await request(app.getHttpServer())
      .post('/api/auth/actions/preview')
      .send({ token: oldToken })
      .expect(410);
    await request(app.getHttpServer())
      .post('/api/auth/actions/preview')
      .send({ token: newToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/auth/invitations/accept')
      .send({ token: newToken, password: 'ReinvitedPassword123!' })
      .expect(200);
    expect(
      (await testPrisma.tenantMembership.findUniqueOrThrow({ where: { id: membershipId } })).status
    ).toBe('ACTIVE');
  });

  it('updates role, status, and locations atomically, revoking target sessions', async () => {
    const created = await invite();
    const membershipId = created.body.employee.id as string;
    const membership = await testPrisma.tenantMembership.findUniqueOrThrow({
      where: { id: membershipId },
    });
    await testPrisma.tenantMembership.update({
      where: { id: membershipId },
      data: { status: 'ACTIVE' },
    });
    const raw = generateSessionToken();
    await testPrisma.session.create({
      data: {
        userId: membership.userId,
        tenantId,
        membershipId,
        locationId,
        credentialVersion: 1,
        membershipAccessVersion: membership.accessVersion,
        tokenHash: hashSessionToken(raw),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const changed = await request(app.getHttpServer())
      .patch(`/api/employees/${membershipId}`)
      .set('Cookie', [ownerCookie])
      .send({
        version: created.body.employee.version,
        role: 'MANAGER',
        status: 'ACTIVE',
        locationIds: [locationId],
      })
      .expect(200);
    expect(changed.body).toMatchObject({
      role: 'MANAGER',
      status: 'ACTIVE',
      locationIds: [locationId],
    });
    expect(
      (await testPrisma.session.findFirstOrThrow({ where: { membershipId } })).revokedAt
    ).not.toBeNull();
    expect(
      await testPrisma.employeeAuditEvent.count({
        where: {
          tenantId,
          targetMembershipId: membershipId,
          action: 'ROLE_STATUS_ASSIGNMENTS_CHANGED',
        },
      })
    ).toBe(1);

    const replacementToken = generateSessionToken();
    await testPrisma.session.create({
      data: {
        userId: membership.userId,
        tenantId,
        membershipId,
        locationId,
        credentialVersion: 1,
        membershipAccessVersion: 2,
        tokenHash: hashSessionToken(replacementToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const revoked = await request(app.getHttpServer())
      .post(`/api/employees/${membershipId}/revoke-sessions`)
      .set('Cookie', [ownerCookie])
      .send({ version: changed.body.version })
      .expect(200);
    expect(revoked.body.version).toBe(changed.body.version + 1);
    expect(
      (
        await testPrisma.session.findUniqueOrThrow({
          where: { tokenHash: hashSessionToken(replacementToken) },
        })
      ).revokedAt
    ).not.toBeNull();
    expect(
      await testPrisma.employeeAuditEvent.count({
        where: { tenantId, targetMembershipId: membershipId, action: 'SESSIONS_REVOKED' },
      })
    ).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/employees/${membershipId}`)
      .set('Cookie', [ownerCookie])
      .send({
        version: created.body.employee.version,
        role: 'CASHIER',
        status: 'ACTIVE',
        locationIds: [locationId],
      })
      .expect(409);
  });

  it('protects the last active OWNER and hides cross-tenant targets', async () => {
    const ownerMembership = await testPrisma.tenantMembership.findFirstOrThrow({
      where: { tenantId, userId: ownerId },
    });
    await request(app.getHttpServer())
      .patch(`/api/employees/${ownerMembership.id}`)
      .set('Cookie', [ownerCookie])
      .send({
        version: ownerMembership.version,
        role: 'MANAGER',
        status: 'ACTIVE',
        locationIds: [locationId],
      })
      .expect(409);
    expect(
      (await testPrisma.tenantMembership.findUniqueOrThrow({ where: { id: ownerMembership.id } }))
        .role
    ).toBe('OWNER');

    const foreign = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        businessName: 'Tenant Ajeno',
        locationName: 'Norte',
        ownerName: 'Owner Ajeno',
        email: 'foreign@example.com',
        password: 'ForeignPassword123!',
      })
      .expect(201);
    const foreignMembership = await testPrisma.tenantMembership.findFirstOrThrow({
      where: { tenantId: foreign.body.tenant.id },
    });
    await request(app.getHttpServer())
      .patch(`/api/employees/${foreignMembership.id}`)
      .set('Cookie', [ownerCookie])
      .send({
        version: foreignMembership.version,
        role: 'CASHIER',
        status: 'DISABLED',
        locationIds: [],
      })
      .expect(404);
  });

  it('issues password reset links only for same-tenant credentials', async () => {
    const created = await invite();
    const membershipId = created.body.employee.id as string;
    const reset = await request(app.getHttpServer()).post(`/api/employees/${membershipId}/password-reset`).set('Cookie', [ownerCookie]).send({ version: created.body.employee.version }).expect(201);
    const resetUrl = new URL(reset.body.action.url);
    expect(resetUrl.pathname).toBe('/reset-password');
    expect(resetUrl.search).toBe('');
    expect(resetUrl.hash).toMatch(/^#token=[A-Za-z0-9_-]+$/);
    const token = await testPrisma.membershipActionToken.findFirstOrThrow({ where: { membershipId, type: 'PASSWORD_RESET' } });
    expect(reset.body.action.url).not.toContain(token.tokenHash);
    const foreign = await request(app.getHttpServer()).post('/api/auth/register').send({ businessName: 'Otro', locationName: 'Otra', ownerName: 'Otro Owner', email: 'foreign-reset@example.com', password: 'OtherPassword123!' }).expect(201);
    await testPrisma.tenantMembership.update({ where: { id: membershipId }, data: { userId: foreign.body.user.id } });
    await request(app.getHttpServer()).post(`/api/employees/${membershipId}/password-reset`).set('Cookie', [ownerCookie]).send({ version: created.body.employee.version }).expect(409);
  });

  it('allows only one concurrent last-owner demotion', async () => {
    const owner = await testPrisma.tenantMembership.findFirstOrThrow({ where: { tenantId, userId: ownerId } });
    const requests = [0, 1].map(() => request(app.getHttpServer()).patch(`/api/employees/${owner.id}`).set('Cookie', [ownerCookie]).send({ version: owner.version, role: 'MANAGER', status: 'ACTIVE', locationIds: [locationId] }));
    const results = await Promise.all(requests);
    expect(results.filter((result) => result.status === 200)).toHaveLength(0);
    expect(results.every((result) => result.status === 409)).toBe(true);
  });
});
