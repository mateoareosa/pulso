import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type MembershipRole, type MembershipStatus } from '@prisma/client';
import type {
  CreateEmployeeInvitationInput,
  EmployeeMutationInput,
  EmployeeResponse,
  ManualActionLinkResponse,
} from '@pulso/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateActionToken, hashActionToken, normalizeEmail } from '../auth/security.utils.js';
import { EmployeeAuditService } from './audit.service.js';

const ACTION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_SERIALIZABLE_ATTEMPTS = 3;

type EmployeeRecord = Prisma.TenantMembershipGetPayload<{
  include: { user: true; locations: { select: { locationId: true } } };
}>;

@Injectable()
export class EmployeesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmployeeAuditService) private readonly audit: EmployeeAuditService
  ) {}

  async list(tenantId: string): Promise<EmployeeResponse[]> {
    const memberships = await this.prisma.tenantMembership.findMany({
      where: { tenantId },
      include: { user: true, locations: { select: { locationId: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return memberships.map((membership) => this.toResponse(membership));
  }

  async invite(
    tenantId: string,
    actorUserId: string,
    input: CreateEmployeeInvitationInput
  ): Promise<{ employee: EmployeeResponse; action: ManualActionLinkResponse }> {
    const rawToken = generateActionToken();
    const expiresAt = new Date(Date.now() + ACTION_TTL_MS);
    const normalizedEmail = normalizeEmail(input.email);
    const employee = await this.withSerializableRetry(async (tx) => {
      await this.assertLocations(tx, tenantId, input.locationIds);
      let user = await tx.user.findUnique({
        where: { normalizedEmail },
        include: {
          memberships: { select: { id: true, tenantId: true, status: true, version: true } },
        },
      });
      const existingMembership = user?.memberships.find(
        (membership) => membership.tenantId === tenantId
      );
      const belongsToAnotherTenant = user?.memberships.some(
        (membership) => membership.tenantId !== tenantId
      );
      if (
        user?.passwordHash ||
        belongsToAnotherTenant ||
        (existingMembership && existingMembership.status !== 'DISABLED')
      ) {
        throw new ConflictException('El correo ya pertenece a un usuario registrado');
      }
      if (user && existingMembership) {
        const claimed = await tx.tenantMembership.updateMany({
          where: {
            id: existingMembership.id,
            tenantId,
            status: 'DISABLED',
            version: existingMembership.version,
          },
          data: {
            role: input.role as MembershipRole,
            status: 'INVITED',
            version: { increment: 1 },
            accessVersion: { increment: 1 },
          },
        });
        if (claimed.count !== 1)
          throw new ConflictException('El empleado cambió concurrentemente');
        await tx.user.update({
          where: { id: user.id },
          data: { email: normalizedEmail, name: input.name },
        });
        await tx.membershipLocation.deleteMany({
          where: { tenantId, membershipId: existingMembership.id },
        });
        if (input.locationIds.length > 0) {
          await tx.membershipLocation.createMany({
            data: input.locationIds.map((locationId) => ({
              tenantId,
              membershipId: existingMembership.id,
              locationId,
            })),
          });
        }
        await tx.membershipActionToken.updateMany({
          where: {
            tenantId,
            membershipId: existingMembership.id,
            type: 'INVITE',
            consumedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        await tx.membershipActionToken.create({
          data: {
            tenantId,
            userId: user.id,
            membershipId: existingMembership.id,
            type: 'INVITE',
            tokenHash: hashActionToken(rawToken),
            expiresAt,
            createdByUserId: actorUserId,
          },
        });
        await tx.session.updateMany({
          where: { tenantId, membershipId: existingMembership.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        const reactivatedMembership = await this.findScoped(
          tx,
          tenantId,
          existingMembership.id
        );
        await this.audit.append(tx, {
          tenantId,
          actorUserId,
          targetMembershipId: existingMembership.id,
          action: 'INVITED',
          metadata: {
            operation: 'reinvited',
            role: input.role,
            locationIds: input.locationIds,
          },
        });
        return reactivatedMembership;
      }
      if (!user) {
        user = await tx.user.create({
          data: { email: normalizedEmail, normalizedEmail, name: input.name, passwordHash: null },
          include: {
            memberships: { select: { id: true, tenantId: true, status: true, version: true } },
          },
        });
      }
      const createdMembership = await tx.tenantMembership.create({
        data: {
          tenantId,
          userId: user.id,
          role: input.role as MembershipRole,
          status: 'INVITED',
        },
      });
      if (input.locationIds.length > 0) {
        await tx.membershipLocation.createMany({
          data: input.locationIds.map((locationId) => ({
            tenantId,
            membershipId: createdMembership.id,
            locationId,
          })),
        });
      }
      const membership = await this.findScoped(tx, tenantId, createdMembership.id);
      await tx.membershipActionToken.create({
        data: {
          tenantId,
          userId: user.id,
          membershipId: membership.id,
          type: 'INVITE',
          tokenHash: hashActionToken(rawToken),
          expiresAt,
          createdByUserId: actorUserId,
        },
      });
      await this.audit.append(tx, {
        tenantId,
        actorUserId,
        targetMembershipId: membership.id,
        action: 'INVITED',
        metadata: { operation: 'created', role: input.role, locationIds: input.locationIds },
      });
      return membership;
    });
    return {
      employee: this.toResponse(employee),
      action: this.actionLink('accept-invitation', rawToken, expiresAt),
    };
  }

  async resendInvitation(
    tenantId: string,
    actorUserId: string,
    membershipId: string,
    version: number
  ) {
    const rawToken = generateActionToken();
    const expiresAt = new Date(Date.now() + ACTION_TTL_MS);
    const employee = await this.withSerializableRetry(async (tx) => {
      const membership = await this.findScoped(tx, tenantId, membershipId);
      if (membership.status !== 'INVITED')
        throw new ConflictException('La invitación ya no está pendiente');
      this.assertVersion(membership.version, version);
      await tx.membershipActionToken.updateMany({
        where: { tenantId, membershipId, type: 'INVITE', consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.membershipActionToken.create({
        data: {
          tenantId,
          userId: membership.userId,
          membershipId,
          type: 'INVITE',
          tokenHash: hashActionToken(rawToken),
          expiresAt,
          createdByUserId: actorUserId,
        },
      });
      const updated = await tx.tenantMembership.update({
        where: { id: membershipId },
        data: { version: { increment: 1 } },
        include: { user: true, locations: { select: { locationId: true } } },
      });
      await this.audit.append(tx, {
        tenantId,
        actorUserId,
        targetMembershipId: membershipId,
        action: 'INVITED',
        metadata: { operation: 'resent' },
      });
      return updated;
    });
    return {
      employee: this.toResponse(employee),
      action: this.actionLink('accept-invitation', rawToken, expiresAt),
    };
  }

  async cancelInvitation(
    tenantId: string,
    actorUserId: string,
    membershipId: string,
    version: number
  ) {
    return await this.withSerializableRetry(async (tx) => {
      const membership = await this.findScoped(tx, tenantId, membershipId);
      if (membership.status !== 'INVITED')
        throw new ConflictException('La invitación ya no está pendiente');
      this.assertVersion(membership.version, version);
      await tx.membershipActionToken.updateMany({
        where: { tenantId, membershipId, type: 'INVITE', consumedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const updated = await tx.tenantMembership.update({
        where: { id: membershipId },
        data: { status: 'DISABLED', version: { increment: 1 }, accessVersion: { increment: 1 } },
        include: { user: true, locations: { select: { locationId: true } } },
      });
      await tx.session.updateMany({
        where: { tenantId, membershipId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.append(tx, {
        tenantId,
        actorUserId,
        targetMembershipId: membershipId,
        action: 'INVITED',
        metadata: { operation: 'cancelled' },
      });
      return this.toResponse(updated);
    });
  }

  async update(
    tenantId: string,
    actorUserId: string,
    membershipId: string,
    input: EmployeeMutationInput
  ): Promise<EmployeeResponse> {
    return await this.withSerializableRetry(async (tx) => {
      const before = await this.findScoped(tx, tenantId, membershipId);
      this.assertVersion(before.version, input.version);
      await this.assertLocations(tx, tenantId, input.locationIds);
      const removesActiveOwner =
        before.role === 'OWNER' &&
        before.status === 'ACTIVE' &&
        (input.role !== 'OWNER' || input.status !== 'ACTIVE');
      if (removesActiveOwner) {
        const activeOwners = await tx.tenantMembership.count({
          where: { tenantId, role: 'OWNER', status: 'ACTIVE' },
        });
        if (activeOwners <= 1)
          throw new ConflictException('El negocio debe conservar al menos un propietario activo');
      }
      const claimed = await tx.tenantMembership.updateMany({
        where: { id: membershipId, tenantId, version: input.version },
        data: {
          role: input.role as MembershipRole,
          status: input.status as MembershipStatus,
          version: { increment: 1 },
          accessVersion: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw new ConflictException('El empleado cambió concurrentemente');
      await tx.membershipLocation.deleteMany({ where: { tenantId, membershipId } });
      if (input.locationIds.length > 0) {
        await tx.membershipLocation.createMany({
          data: input.locationIds.map((locationId) => ({ tenantId, membershipId, locationId })),
        });
      }
      await tx.session.updateMany({
        where: { tenantId, membershipId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const updated = await this.findScoped(tx, tenantId, membershipId);
      await this.audit.append(tx, {
        tenantId,
        actorUserId,
        targetMembershipId: membershipId,
        action: 'ROLE_STATUS_ASSIGNMENTS_CHANGED',
        metadata: {
          before: {
            role: before.role,
            status: before.status,
            locationIds: before.locations.map((item) => item.locationId),
          },
          after: { role: input.role, status: input.status, locationIds: input.locationIds },
        },
      });
      return this.toResponse(updated);
    });
  }

  async issuePasswordReset(
    tenantId: string,
    actorUserId: string,
    membershipId: string,
    version: number
  ) {
    const rawToken = generateActionToken();
    const expiresAt = new Date(Date.now() + ACTION_TTL_MS);
    const employee = await this.withSerializableRetry(async (tx) => {
      const membership = await this.findScoped(tx, tenantId, membershipId);
      this.assertVersion(membership.version, version);
      const otherMembership = await tx.tenantMembership.findFirst({
        where: { userId: membership.userId, tenantId: { not: tenantId } },
        select: { id: true },
      });
      if (otherMembership)
        throw new ConflictException(
          'No se puede restablecer una credencial compartida con otro negocio'
        );
      await tx.membershipActionToken.updateMany({
        where: {
          userId: membership.userId,
          type: 'PASSWORD_RESET',
          consumedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await tx.membershipActionToken.create({
        data: {
          tenantId,
          userId: membership.userId,
          membershipId,
          type: 'PASSWORD_RESET',
          tokenHash: hashActionToken(rawToken),
          expiresAt,
          createdByUserId: actorUserId,
        },
      });
      await this.audit.append(tx, {
        tenantId,
        actorUserId,
        targetMembershipId: membershipId,
        action: 'PASSWORD_RESET_ISSUED',
        metadata: {},
      });
      return membership;
    });
    return {
      employee: this.toResponse(employee),
      action: this.actionLink('reset-password', rawToken, expiresAt),
    };
  }

  async revokeSessions(
    tenantId: string,
    actorUserId: string,
    membershipId: string,
    version: number
  ) {
    return await this.withSerializableRetry(async (tx) => {
      const membership = await this.findScoped(tx, tenantId, membershipId);
      this.assertVersion(membership.version, version);
      const updated = await tx.tenantMembership.update({
        where: { id: membershipId },
        data: { version: { increment: 1 }, accessVersion: { increment: 1 } },
        include: { user: true, locations: { select: { locationId: true } } },
      });
      await tx.session.updateMany({
        where: { tenantId, membershipId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.append(tx, {
        tenantId,
        actorUserId,
        targetMembershipId: membershipId,
        action: 'SESSIONS_REVOKED',
        metadata: {},
      });
      return this.toResponse(updated);
    });
  }

  private async findScoped(
    tx: Prisma.TransactionClient,
    tenantId: string,
    membershipId: string
  ): Promise<EmployeeRecord> {
    const membership = await tx.tenantMembership.findFirst({
      where: { id: membershipId, tenantId },
      include: { user: true, locations: { select: { locationId: true } } },
    });
    if (!membership) throw new NotFoundException('Empleado no encontrado');
    return membership;
  }

  private async assertLocations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    locationIds: string[]
  ): Promise<void> {
    if (locationIds.length === 0) return;
    const count = await tx.location.count({
      where: { tenantId, id: { in: locationIds }, isActive: true },
    });
    if (count !== locationIds.length)
      throw new ConflictException('Una o más sucursales no están disponibles');
  }

  private assertVersion(actual: number, expected: number): void {
    if (actual !== expected) throw new ConflictException('El empleado cambió concurrentemente');
  }

  private toResponse(membership: EmployeeRecord): EmployeeResponse {
    return {
      id: membership.id,
      userId: membership.userId,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
      status: membership.status,
      version: membership.version,
      locationIds: membership.locations.map((item) => item.locationId).sort(),
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }

  private actionLink(path: string, token: string, expiresAt: Date): ManualActionLinkResponse {
    const baseUrl = (process.env.WEB_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    return {
      // Keep bearer tokens in the fragment: browsers do not send fragments in HTTP requests,
      // Referer headers, or server/proxy request logs. The action page must POST the token body.
      url: `${baseUrl}/${path}#token=${encodeURIComponent(token)}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async withSerializableRetry<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt < MAX_SERIALIZABLE_ATTEMPTS &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        )
          continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('El empleado o la invitación ya existe');
        }
        throw error;
      }
    }
    throw new ConflictException('Conflicto concurrente');
  }
}
