import {
  Controller,
  Post,
  Body,
  HttpCode,
  ForbiddenException,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimiterService } from '../auth/rate-limiter.service.js';
import { normalizeEmail } from '../auth/security.utils.js';

@Controller('test')
export class TestResetController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RateLimiterService) private readonly rateLimiter?: RateLimiterService
  ) {}

  @Post('reset')
  @HttpCode(200)
  async reset() {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException('Test reset is only permitted in test environments');
    }

    await this.prisma.cleanDatabaseForTesting();
    this.rateLimiter?.reset();
    return { success: true, message: 'Database reset successfully' };
  }

  @Post('set-role')
  @HttpCode(200)
  async setRole(@Body() body: { email: string; role: 'OWNER' | 'MANAGER' | 'CASHIER' }) {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException('Only permitted in test environments');
    }

    const user = await this.prisma.user.findFirst({
      where: { normalizedEmail: normalizeEmail(body.email) },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memberships = await this.prisma.tenantMembership.findMany({
      where: { userId: user.id },
      include: {
        tenant: {
          select: { locations: { where: { isActive: true }, select: { id: true } } },
        },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantMembership.updateMany({
        where: { userId: user.id },
        data: { role: body.role },
      });

      if (body.role !== 'OWNER') {
        await tx.membershipLocation.createMany({
          data: memberships.flatMap((membership) =>
            membership.tenant.locations.map((location) => ({
              tenantId: membership.tenantId,
              membershipId: membership.id,
              locationId: location.id,
            }))
          ),
          skipDuplicates: true,
        });
      }
    });

    return { success: true, role: body.role };
  }
}
