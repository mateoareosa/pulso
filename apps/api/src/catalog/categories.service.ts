import { Injectable, ConflictException, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateCategoryCommand, UpdateCategoryCommand } from '@pulso/contracts';
import { normalizeSearchText } from './catalog.utils.js';

import { Prisma } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Ya existe una categoría con ese nombre en este negocio');
    }
    throw error;
  }

  async listCategories(tenantId: string) {
    return await this.prisma.category.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async createCategory(tenantId: string, dto: CreateCategoryCommand) {
    const normalizedName = normalizeSearchText(dto.name);

    const existing = await this.prisma.category.findUnique({
      where: {
        tenantId_normalizedName: {
          tenantId,
          normalizedName,
        },
      },
    });

    if (existing) {
      throw new ConflictException('Ya existe una categoría con ese nombre en este negocio');
    }

    try {
      return await this.prisma.category.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          normalizedName,
          isActive: true,
        },
      });
    } catch (err: unknown) {
      this.handlePrismaError(err);
    }
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateCategoryCommand) {
    const category = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });

    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    let normalizedName = category.normalizedName;
    if (dto.name) {
      normalizedName = normalizeSearchText(dto.name);
      if (normalizedName !== category.normalizedName) {
        const collision = await this.prisma.category.findUnique({
          where: {
            tenantId_normalizedName: {
              tenantId,
              normalizedName,
            },
          },
        });
        if (collision) {
          throw new ConflictException('Ya existe otra categoría con ese nombre en este negocio');
        }
      }
    }

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim(), normalizedName } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    } catch (err: unknown) {
      this.handlePrismaError(err);
    }
  }
}
