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
} from '@pulso/contracts';
import { normalizeEmail, hashPassword, verifyPassword } from './security.utils.js';

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
          await tx.tenantMembership.create({
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
            locationId: location.id,
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
          include: {
            tenant: {
              include: {
                locations: {
                  where: { isActive: true },
                  orderBy: { createdAt: 'asc' },
                },
              },
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

    const passwordMatch = await verifyPassword(user.passwordHash, input.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Identify active membership
    const activeMembership = user.memberships.find((m) => m.status === 'ACTIVE');
    if (!activeMembership) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Identify active branch location
    const activeLocation = activeMembership.tenant.locations.find((l) => l.isActive);
    if (!activeLocation) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const { token, expiresAt } = await this.sessionService.createSession(this.prisma, {
      userId: user.id,
      tenantId: activeMembership.tenant.id,
      locationId: activeLocation.id,
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
}
