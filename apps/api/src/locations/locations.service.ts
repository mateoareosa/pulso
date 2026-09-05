import { Injectable, Inject } from '@nestjs/common';
import { Location, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { LocationResponse } from '@pulso/contracts';

@Injectable()
export class LocationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createLocation(
    client: Prisma.TransactionClient | PrismaService,
    params: { tenantId: string; name: string; address?: string | null }
  ): Promise<Location> {
    return await client.location.create({
      data: {
        tenantId: params.tenantId,
        name: params.name,
        address: params.address,
        isActive: true,
      },
    });
  }

  async findByTenant(tenantId: string): Promise<LocationResponse[]> {
    const locations = await this.prisma.location.findMany({
      where: {
        tenantId,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return locations.map((loc) => ({
      id: loc.id,
      tenantId: loc.tenantId,
      name: loc.name,
      address: loc.address,
      isActive: loc.isActive,
      createdAt: loc.createdAt.toISOString(),
      updatedAt: loc.updatedAt.toISOString(),
    }));
  }

  async createLocationForTenant(
    tenantId: string,
    params: { name: string; address?: string | null }
  ): Promise<LocationResponse> {
    const loc = await this.createLocation(this.prisma, {
      tenantId,
      name: params.name,
      address: params.address,
    });
    return {
      id: loc.id,
      tenantId: loc.tenantId,
      name: loc.name,
      address: loc.address,
      isActive: loc.isActive,
      createdAt: loc.createdAt.toISOString(),
      updatedAt: loc.updatedAt.toISOString(),
    };
  }
}
