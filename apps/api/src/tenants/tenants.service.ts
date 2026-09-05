import { Injectable, Inject } from '@nestjs/common';
import { Prisma, Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateSlug, resolveSlugCollision } from './slug.utils.js';

@Injectable()
export class TenantsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Generates a collision-safe unique slug and creates a Tenant record inside a transaction.
   */
  async createTenantWithUniqueSlug(
    client: Prisma.TransactionClient | PrismaService,
    name: string
  ): Promise<Tenant> {
    const baseSlug = generateSlug(name);
    let candidateSlug = baseSlug;
    let attempt = 1;

    // Check slug availability in loop
    while (true) {
      const existing = await client.tenant.findUnique({
        where: { slug: candidateSlug },
        select: { id: true },
      });

      if (!existing) {
        break;
      }

      candidateSlug = resolveSlugCollision(baseSlug, attempt);
      attempt++;
    }

    return await client.tenant.create({
      data: {
        name,
        slug: candidateSlug,
      },
    });
  }

  async findById(id: string): Promise<Tenant | null> {
    return await this.prisma.tenant.findUnique({
      where: { id },
    });
  }
}
