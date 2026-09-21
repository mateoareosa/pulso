import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateSessionToken, hashSessionToken } from './security.utils.js';
import { SessionContext } from './cookie.utils.js';

@Injectable()
export class SessionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public getSessionTtlHours(): number {
    const configured = process.env.SESSION_TTL_HOURS;
    return configured ? parseInt(configured, 10) || 24 : 24;
  }

  public calculateExpirationDate(): Date {
    const hours = this.getSessionTtlHours();
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }

  /**
   * Creates a new revocable opaque session within an optional Prisma transaction client.
   */
  async createSession(
    client: Prisma.TransactionClient | PrismaService,
    params: {
      userId: string;
      tenantId: string;
      membershipId?: string;
      locationId: string;
      credentialVersion?: number;
      membershipAccessVersion?: number;
    }
  ): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = this.calculateExpirationDate();
    const membership = await client.tenantMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: params.tenantId, userId: params.userId },
      },
      select: {
        id: true,
        role: true,
        status: true,
        accessVersion: true,
        user: { select: { credentialVersion: true, status: true } },
        locations: { where: { locationId: params.locationId }, select: { id: true } },
      },
    });
    const location = await client.location.findFirst({
      where: { id: params.locationId, tenantId: params.tenantId, isActive: true },
      select: { id: true },
    });
    if (
      !membership ||
      !location ||
      membership.status !== 'ACTIVE' ||
      membership.user.status !== 'ACTIVE' ||
      (params.membershipId && membership.id !== params.membershipId) ||
      (membership.role !== 'OWNER' && membership.locations.length !== 1)
    ) {
      throw new UnauthorizedException('Membresía inválida');
    }

    const session = await client.session.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        membershipId: membership.id,
        locationId: params.locationId,
        credentialVersion: params.credentialVersion ?? membership.user.credentialVersion,
        membershipAccessVersion: params.membershipAccessVersion ?? membership.accessVersion,
        tokenHash,
        expiresAt,
      },
    });

    return { token, expiresAt, sessionId: session.id };
  }

  /**
   * Validates a raw opaque session token against PostgreSQL by comparing its SHA-256 hash.
   * Enforces expiration, revocation, user active status, and tenant membership active status.
   */
  async validateSession(rawToken: string): Promise<SessionContext> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new UnauthorizedException('Token de sesión no proporcionado');
    }

    const tokenHash = hashSessionToken(rawToken);

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: true,
        tenant: true,
        location: true,
        membership: {
          include: {
            locations: {
              select: { locationId: true },
            },
          },
        },
      },
    });

    if (!session) {
      throw new UnauthorizedException('Sesión inválida');
    }

    if (session.revokedAt) {
      throw new UnauthorizedException('Sesión revocada');
    }

    if (new Date() > session.expiresAt) {
      throw new UnauthorizedException('Sesión expirada');
    }

    if (session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Usuario deshabilitado');
    }

    // Verify location exists and is active
    if (!session.location || !session.location.isActive) {
      throw new UnauthorizedException('Sucursal inactiva o inexistente');
    }

    // Verify location belongs to the session's tenant
    if (session.location.tenantId !== session.tenantId) {
      throw new UnauthorizedException(
        'Inconsistencia de sesión: la sucursal no pertenece al comercio'
      );
    }

    const membership = session.membership;
    if (
      membership.userId !== session.userId ||
      membership.status !== 'ACTIVE' ||
      session.credentialVersion !== session.user.credentialVersion ||
      session.membershipAccessVersion !== membership.accessVersion
    ) {
      throw new UnauthorizedException('Membresía inactiva');
    }

    if (
      membership.role !== 'OWNER' &&
      !membership.locations.some((assignment) => assignment.locationId === session.locationId)
    ) {
      throw new UnauthorizedException('Sucursal no asignada');
    }

    return {
      sessionId: session.id,
      userId: session.userId,
      tenantId: session.tenantId,
      locationId: session.locationId,
      membershipId: membership.id,
      role: membership.role,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      tenant: {
        id: session.tenant.id,
        name: session.tenant.name,
        slug: session.tenant.slug,
      },
      location: {
        id: session.location.id,
        name: session.location.name,
      },
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  /**
   * Revokes a session idempotently.
   */
  async revokeSession(rawToken?: string): Promise<void> {
    if (!rawToken || typeof rawToken !== 'string') {
      return;
    }

    const tokenHash = hashSessionToken(rawToken);

    await this.prisma.session
      .updateMany({
        where: {
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      })
      .catch(() => {
        // Idempotent: ignore if not found
      });
  }
}
