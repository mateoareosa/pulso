import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { SessionService } from './session.service.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { LocationsService } from '../locations/locations.service.js';
import {
  RegisterInput,
  RegisterInputSchema,
  LoginInput,
  LoginInputSchema,
  CurrentUserResponse,
  AcceptInvitationInputSchema,
  ChangePasswordInputSchema,
  ResetPasswordInputSchema,
  type ActionPreviewResponse,
} from '@pulso/contracts';
import { normalizeEmail, hashPassword, verifyPassword, hashActionToken } from './security.utils.js';
import { GoneException } from '@nestjs/common';

// Pre-computed dummy hash to prevent timing attacks / user enumeration on nonexistent emails
const DUMMY_ARGON2_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$bHVjaWFuYTEyMzQ1Njc4OTA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SessionService) private readonly sessionService: SessionService,
    @Inject(TenantsService) private readonly tenantsService: TenantsService,
    @Inject(LocationsService) private readonly locationsService: LocationsService
  ) {}

  /**
   * Registers a new tenant, initial location, global user, owner membership, and active session
   * atomically in a single PostgreSQL interactive transaction.
   */
  async register(
    rawInput: unknown
  ): Promise<{ token: string; expiresAt: Date; payload: CurrentUserResponse }> {
    const parseResult = RegisterInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Datos de registro inválidos',
        errors: parseResult.error.errors,
      });
    }

    const input: RegisterInput = parseResult.data;
    const normalizedEmail = normalizeEmail(input.email);

    // Conflict check before starting transaction
    const existingUser = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('El correo electrónico ya se encuentra registrado');
    }

    const passwordHash = await hashPassword(input.password);

    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          // 1. Create User
          const user = await tx.user.create({
            data: {
              email: input.email.trim(),
              normalizedEmail,
              name: input.ownerName.trim(),
              passwordHash,
              status: 'ACTIVE',
            },
          });

          // 2. Create Tenant with unique collision-safe slug
          const tenant = await this.tenantsService.createTenantWithUniqueSlug(
            tx,
            input.businessName.trim()
          );

          // 3. Create initial Location
          const location = await this.locationsService.createLocation(tx, {
            tenantId: tenant.id,
            name: input.locationName.trim(),
          });

          // 4. Create TenantMembership with OWNER role
          const membership = await tx.tenantMembership.create({
            data: {
              tenantId: tenant.id,
              userId: user.id,
              role: 'OWNER',
              status: 'ACTIVE',
            },
          });

          // 5. Create initial session
          const { token, expiresAt } = await this.sessionService.createSession(tx, {
            userId: user.id,
            tenantId: tenant.id,
            membershipId: membership.id,
            locationId: location.id,
            credentialVersion: user.credentialVersion,
            membershipAccessVersion: membership.accessVersion,
          });

          return {
            token,
            expiresAt,
            payload: {
              user: {
                id: user.id,
                email: user.email,
                name: user.name,
              },
              tenant: {
                id: tenant.id,
                name: tenant.name,
                slug: tenant.slug,
              },
              location: {
                id: location.id,
                name: location.name,
              },
              role: 'OWNER' as const,
              expiresAt: expiresAt.toISOString(),
            },
          };
        });

        return result;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = Array.isArray(error.meta?.target)
            ? (error.meta.target as string[])
            : typeof error.meta?.target === 'string'
              ? [error.meta.target]
              : [];

          if (
            target.some((t) =>
              ['normalizedEmail', 'email', 'users_normalizedEmail_key', 'users_email_key'].includes(
                t
              )
            )
          ) {
            throw new ConflictException('El correo electrónico ya se encuentra registrado');
          }

          if (target.some((t) => ['slug', 'tenants_slug_key'].includes(t))) {
            if (attempt < maxRetries) {
              continue;
            }
          }

          throw new ConflictException('Conflicto con un registro existente en la base de datos');
        }

        throw error;
      }
    }

    throw new ConflictException(
      'No se pudo completar el registro debido a una colisión concurrente'
    );
  }

  /**
   * Authenticates user credentials using Argon2id, verifies membership and tenant active status,
   * and creates a new revocable opaque session. Generic 401 prevents user enumeration.
   */
  async login(
    rawInput: unknown
  ): Promise<{ token: string; expiresAt: Date; payload: CurrentUserResponse }> {
    const parseResult = LoginInputSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Credenciales inválidas',
        errors: parseResult.error.errors,
      });
    }

    const input: LoginInput = parseResult.data;
    const normalizedEmail = normalizeEmail(input.email);

    const user = await this.prisma.user.findUnique({
      where: { normalizedEmail },
      include: {
        memberships: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'asc' },
          include: {
            tenant: {
              include: {
                locations: {
                  where: { isActive: true },
                  orderBy: { createdAt: 'asc' },
                },
              },
            },
            locations: {
              include: { location: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!user || user.status === 'DISABLED') {
      // Execute dummy password verification to maintain constant-time response profile
      await verifyPassword(DUMMY_ARGON2_HASH, input.password);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordMatch = user.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : false;
    if (!passwordMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Identify active membership
    const activeMembership = user.memberships.find(
      (membership) => !input.tenantId || membership.tenantId === input.tenantId
    );
    if (!activeMembership) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Identify active branch location
    const activeLocation =
      activeMembership.role === 'OWNER'
        ? activeMembership.tenant.locations.find(
            (location) => !input.locationId || location.id === input.locationId
          )
        : activeMembership.locations
            .map((assignment) => assignment.location)
            .find(
              (location) =>
                location.isActive && (!input.locationId || location.id === input.locationId)
            );
    if (!activeLocation) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const { token, expiresAt } = await this.sessionService.createSession(this.prisma, {
      userId: user.id,
      tenantId: activeMembership.tenant.id,
      membershipId: activeMembership.id,
      locationId: activeLocation.id,
      credentialVersion: user.credentialVersion,
      membershipAccessVersion: activeMembership.accessVersion,
    });

    return {
      token,
      expiresAt,
      payload: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        tenant: {
          id: activeMembership.tenant.id,
          name: activeMembership.tenant.name,
          slug: activeMembership.tenant.slug,
        },
        location: {
          id: activeLocation.id,
          name: activeLocation.name,
        },
        role: activeMembership.role,
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  async previewAction(rawToken: string): Promise<ActionPreviewResponse> {
    const tokenHash = hashActionToken(rawToken);
    const action = await this.prisma.membershipActionToken.findUnique({
      where: { tokenHash },
      include: { tenant: true, user: true, membership: true },
    });
    this.assertUsableAction(action);
    return {
      type: action.type,
      tenantName: action.tenant.name,
      email: action.user.email,
      expiresAt: action.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(rawInput: unknown): Promise<void> {
    const parsed = AcceptInvitationInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invitación inválida',
        errors: parsed.error.errors,
      });
    }
    const tokenHash = await this.validatePasswordAction(parsed.data.token, 'INVITE');
    const passwordHash = await hashPassword(parsed.data.password);
    await this.consumePasswordAction(tokenHash, 'INVITE', passwordHash, true);
  }

  async resetPassword(rawInput: unknown): Promise<void> {
    const parsed = ResetPasswordInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Restablecimiento inválido',
        errors: parsed.error.errors,
      });
    }
    const tokenHash = await this.validatePasswordAction(parsed.data.token, 'PASSWORD_RESET');
    const passwordHash = await hashPassword(parsed.data.password);
    await this.consumePasswordAction(tokenHash, 'PASSWORD_RESET', passwordHash, false);
  }

  async changePassword(session: { userId: string }, rawInput: unknown): Promise<void> {
    const parsed = ChangePasswordInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Contraseña inválida',
        errors: parsed.error.errors,
      });
    }
    const user = await this.prisma.user.findUnique({ where: { id: session.userId } });
    if (
      !user?.passwordHash ||
      !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))
    ) {
      throw new UnauthorizedException('Contraseña actual inválida');
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await this.prisma.$transaction(
      async (tx) => {
        const changed = await tx.user.updateMany({
          where: { id: session.userId, credentialVersion: user.credentialVersion },
          data: { passwordHash, credentialVersion: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictException('La contraseña cambió concurrentemente');
        await tx.session.updateMany({
          where: { userId: session.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  }

  private async consumePasswordAction(
    tokenHash: string,
    expectedType: 'INVITE' | 'PASSWORD_RESET',
    passwordHash: string,
    activateMembership: boolean
  ): Promise<void> {
    await this.withSerializableRetry(async (tx) => {
      const action = await tx.membershipActionToken.findUnique({
        where: { tokenHash },
        include: { membership: true },
      });
      this.assertUsableAction(action, expectedType);
      const consumed = await tx.membershipActionToken.updateMany({
        where: {
          id: action.id,
          type: expectedType,
          consumedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new GoneException('El enlace ya no está disponible');

      await tx.user.update({
        where: { id: action.userId },
        data: { passwordHash, credentialVersion: { increment: 1 } },
      });
      if (activateMembership) {
        const membership = await tx.tenantMembership.findUnique({
          where: { id: action.membershipId },
        });
        if (
          !membership ||
          membership.tenantId !== action.tenantId ||
          membership.status !== 'INVITED'
        ) {
          throw new GoneException('El enlace ya no está disponible');
        }
        await tx.tenantMembership.update({
          where: { id: membership.id },
          data: { status: 'ACTIVE', version: { increment: 1 }, accessVersion: { increment: 1 } },
        });
      }
      await tx.session.updateMany({
        where: { userId: action.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async validatePasswordAction(
    rawToken: string,
    expectedType: 'INVITE' | 'PASSWORD_RESET'
  ): Promise<string> {
    const tokenHash = hashActionToken(rawToken);
    const action = await this.prisma.membershipActionToken.findUnique({
      where: { tokenHash },
      include: { membership: true },
    });
    this.assertUsableAction(action, expectedType);
    return tokenHash;
  }

  private assertUsableAction<
    T extends {
      type: string;
      tenantId: string;
      userId: string;
      expiresAt: Date;
      consumedAt: Date | null;
      revokedAt: Date | null;
      membership: { tenantId: string; userId: string };
    } | null,
  >(action: T, expectedType?: 'INVITE' | 'PASSWORD_RESET'): asserts action is Exclude<T, null> {
    if (!action || (expectedType && action.type !== expectedType)) {
      throw new UnauthorizedException('Enlace inválido');
    }
    if (
      action.membership.tenantId !== action.tenantId ||
      action.membership.userId !== action.userId
    ) {
      throw new UnauthorizedException('Enlace inválido');
    }
    if (action.consumedAt || action.revokedAt || action.expiresAt <= new Date()) {
      throw new GoneException('El enlace ya no está disponible');
    }
  }

  private async withSerializableRetry<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          attempt < 3 &&
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new ConflictException('Conflicto concurrente');
  }
}
