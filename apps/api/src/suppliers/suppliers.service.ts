import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Supplier } from '@prisma/client';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  CreateSupplierCommand,
  UpdateSupplierCommand,
  QuerySuppliers,
  SupplierResponse,
  PaginatedSuppliersResponse,
} from '@pulso/contracts';
import { normalizeSearchText } from '../catalog/catalog.utils.js';

@Injectable()
export class SuppliersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createSupplier(
    command: CreateSupplierCommand,
    session: SessionContext
  ): Promise<SupplierResponse> {
    if (!session?.tenantId) {
      throw new BadRequestException('Contexto de sesión con tenantId es obligatorio.');
    }

    const { tenantId } = session;
    const { name, taxId, phone, email, address, notes } = command;
    const normalizedName = normalizeSearchText(name);

    if (taxId) {
      const existingWithTaxId = await this.prisma.supplier.findFirst({
        where: {
          tenantId,
          taxId,
        },
      });

      if (existingWithTaxId) {
        throw new ConflictException(`Ya existe un proveedor registrado con el CUIT ${taxId}.`);
      }
    }

    const created = await this.prisma.supplier.create({
      data: {
        tenantId,
        name: name.trim(),
        normalizedName,
        taxId: taxId || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        notes: notes?.trim() || null,
        isActive: true,
      },
    });

    return this.mapSupplierToResponse(created);
  }

  async updateSupplier(
    id: string,
    command: UpdateSupplierCommand,
    session: SessionContext
  ): Promise<SupplierResponse> {
    if (!session?.tenantId) {
      throw new BadRequestException('Contexto de sesión con tenantId es obligatorio.');
    }

    const { tenantId } = session;

    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado.');
    }

    if (command.taxId && command.taxId !== supplier.taxId) {
      const existingWithTaxId = await this.prisma.supplier.findFirst({
        where: {
          tenantId,
          taxId: command.taxId,
          id: { not: id },
        },
      });

      if (existingWithTaxId) {
        throw new ConflictException(
          `Ya existe un proveedor registrado con el CUIT ${command.taxId}.`
        );
      }
    }

    const updated = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...(command.name
          ? { name: command.name.trim(), normalizedName: normalizeSearchText(command.name) }
          : {}),
        ...(command.taxId !== undefined ? { taxId: command.taxId } : {}),
        ...(command.phone !== undefined ? { phone: command.phone?.trim() || null } : {}),
        ...(command.email !== undefined ? { email: command.email?.trim() || null } : {}),
        ...(command.address !== undefined ? { address: command.address?.trim() || null } : {}),
        ...(command.notes !== undefined ? { notes: command.notes?.trim() || null } : {}),
        ...(command.isActive !== undefined ? { isActive: command.isActive } : {}),
        version: { increment: 1 },
      },
    });

    return this.mapSupplierToResponse(updated);
  }

  async getSuppliers(
    query: QuerySuppliers,
    session: SessionContext
  ): Promise<PaginatedSuppliersResponse> {
    if (!session?.tenantId) {
      throw new BadRequestException('Contexto de sesión con tenantId es obligatorio.');
    }

    const { tenantId } = session;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.SupplierWhereInput = { tenantId };

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search && query.search.trim().length > 0) {
      const norm = normalizeSearchText(query.search);
      where.OR = [
        { normalizedName: { contains: norm } },
        { taxId: { contains: norm } },
        { phone: { contains: norm } },
        { email: { contains: norm, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.supplier.count({ where });

    const items = await this.prisma.supplier.findMany({
      where,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map((s) => this.mapSupplierToResponse(s)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getSupplierById(id: string, session: SessionContext): Promise<SupplierResponse> {
    if (!session?.tenantId) {
      throw new BadRequestException('Contexto de sesión con tenantId es obligatorio.');
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId: session.tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado.');
    }

    return this.mapSupplierToResponse(supplier);
  }

  private mapSupplierToResponse(s: Supplier): SupplierResponse {
    return {
      id: s.id,
      tenantId: s.tenantId,
      name: s.name,
      normalizedName: s.normalizedName,
      taxId: s.taxId,
      phone: s.phone,
      email: s.email,
      address: s.address,
      notes: s.notes,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
