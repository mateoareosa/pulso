import { Injectable, NotFoundException, ConflictException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  CreateProductCommand,
  UpdateProductCommand,
  UpdateLocationSettingsCommand,
  CreateStockAdjustmentCommand,
  ProductSearchQuery,
  ProductResponse,
} from '@pulso/contracts';
import { normalizeSearchText, toDecimal, formatDecimal } from './catalog.utils.js';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: { select: { id: true; name: true } };
    locations: true;
  };
}>;

@Injectable()
export class ProductsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private mapProductLocation(
    pl?: {
      productId: string;
      locationId: string;
      stockQuantity: Decimal;
      minimumStock: Decimal;
      isAvailable: boolean;
      quickSlot: number | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    } | null
  ) {
    if (!pl) return null;
    return {
      productId: pl.productId,
      locationId: pl.locationId,
      stockQuantity: formatDecimal(pl.stockQuantity),
      minimumStock: formatDecimal(pl.minimumStock),
      isAvailable: pl.isAvailable,
      quickSlot: pl.quickSlot,
      version: pl.version,
      createdAt: pl.createdAt.toISOString(),
      updatedAt: pl.updatedAt.toISOString(),
    };
  }

  private mapProduct(product: {
    id: string;
    tenantId: string;
    categoryId: string | null;
    name: string;
    normalizedName: string;
    barcode: string | null;
    sku: string | null;
    salePriceCents: number;
    costPriceCents: number | null;
    unit: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    category?: { id: string; name: string } | null;
    locations?: Array<{
      productId: string;
      locationId: string;
      stockQuantity: Decimal;
      minimumStock: Decimal;
      isAvailable: boolean;
      quickSlot: number | null;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    }>;
  }) {
    const loc = product.locations?.[0] || null;
    return {
      id: product.id,
      tenantId: product.tenantId,
      categoryId: product.categoryId,
      name: product.name,
      normalizedName: product.normalizedName,
      barcode: product.barcode,
      sku: product.sku,
      salePriceCents: product.salePriceCents,
      costPriceCents: product.costPriceCents,
      unit: product.unit,
      isActive: product.isActive,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      category: product.category ? { id: product.category.id, name: product.category.name } : null,
      locationSettings: this.mapProductLocation(loc),
    };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = Array.isArray(error.meta?.target)
        ? error.meta?.target.join(',')
        : String(error.meta?.target || '');
      if (target.includes('barcode')) {
        throw new ConflictException('El código de barras ya está registrado en este negocio');
      }
      if (target.includes('sku')) {
        throw new ConflictException('El código SKU ya está registrado en este negocio');
      }
      if (target.includes('quickSlot') || target.includes('locationId_quickSlot')) {
        throw new ConflictException('El slot rápido ya está ocupado en esta sucursal');
      }
      if (target.includes('normalizedName')) {
        throw new ConflictException('Ya existe un producto con un nombre similar en este negocio');
      }
      throw new ConflictException('Conflicto de unicidad al registrar o actualizar el producto');
    }
    throw error;
  }

  async searchProducts(session: SessionContext, query: ProductSearchQuery) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);
    const skip = (page - 1) * limit;

    const isCashier = session.role === 'CASHIER';
    const status = query.status;
    let isActiveFilter: boolean | undefined = true;

    if (isCashier) {
      isActiveFilter = true;
    } else if (status === 'ALL' || query.includeInactive === true) {
      isActiveFilter = undefined;
    } else if (status === 'INACTIVE') {
      isActiveFilter = false;
    } else {
      isActiveFilter = true;
    }

    const onlyAvailable = isCashier || query.onlyAvailable === true;

    const where: Prisma.ProductWhereInput = {
      tenantId: session.tenantId,
      ...(isActiveFilter !== undefined ? { isActive: isActiveFilter } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    };

    if (onlyAvailable) {
      where.locations = {
        some: {
          locationId: session.locationId,
          isAvailable: true,
        },
      };
    }

    const trimmedQuery = query.q?.trim();
    const barcodeQuery = query.barcode?.trim();

    if (barcodeQuery) {
      where.barcode = barcodeQuery;
    } else if (trimmedQuery) {
      const normalizedQ = normalizeSearchText(trimmedQuery);
      where.OR = [
        { barcode: trimmedQuery },
        { normalizedName: { contains: normalizedQ } },
        { barcode: { contains: trimmedQuery } },
        { sku: { contains: trimmedQuery } },
      ];
    }

    let rawItems: ProductWithRelations[];
    let total: number;

    if (trimmedQuery && !barcodeQuery) {
      // Find if an exact barcode match exists globally within the active query
      const exactBarcodeMatch = await this.prisma.product.findFirst({
        where: {
          ...where,
          barcode: trimmedQuery,
        },
        include: {
          category: { select: { id: true, name: true } },
          locations: {
            where: { locationId: session.locationId },
          },
        },
      });

      total = await this.prisma.product.count({ where });

      if (exactBarcodeMatch) {
        if (page === 1) {
          const otherItems = await this.prisma.product.findMany({
            where: {
              ...where,
              id: { not: exactBarcodeMatch.id },
            },
            include: {
              category: { select: { id: true, name: true } },
              locations: {
                where: { locationId: session.locationId },
              },
            },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            skip: 0,
            take: limit - 1,
          });
          rawItems = [exactBarcodeMatch, ...otherItems];
        } else {
          rawItems = await this.prisma.product.findMany({
            where: {
              ...where,
              id: { not: exactBarcodeMatch.id },
            },
            include: {
              category: { select: { id: true, name: true } },
              locations: {
                where: { locationId: session.locationId },
              },
            },
            orderBy: [{ name: 'asc' }, { id: 'asc' }],
            skip: skip - 1,
            take: limit,
          });
        }
      } else {
        rawItems = await this.prisma.product.findMany({
          where,
          include: {
            category: { select: { id: true, name: true } },
            locations: {
              where: { locationId: session.locationId },
            },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip,
          take: limit,
        });
      }
    } else {
      [rawItems, total] = await Promise.all([
        this.prisma.product.findMany({
          where,
          include: {
            category: { select: { id: true, name: true } },
            locations: {
              where: { locationId: session.locationId },
            },
          },
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip,
          take: limit,
        }),
        this.prisma.product.count({ where }),
      ]);
    }

    const items = rawItems.map((p) => this.mapProduct(p));

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getQuickSlots(session: SessionContext): Promise<ProductResponse[]> {
    const isCashier = session.role === 'CASHIER';

    const products = await this.prisma.product.findMany({
      where: {
        tenantId: session.tenantId,
        ...(isCashier ? { isActive: true } : {}),
        locations: {
          some: {
            locationId: session.locationId,
            quickSlot: { not: null, gte: 1, lte: 8 },
            ...(isCashier ? { isAvailable: true } : {}),
          },
        },
      },
      include: {
        category: { select: { id: true, name: true } },
        locations: {
          where: { locationId: session.locationId },
        },
      },
    });

    return products
      .map((p) => this.mapProduct(p))
      .sort((a, b) => (a.locationSettings?.quickSlot || 0) - (b.locationSettings?.quickSlot || 0));
  }

  async getProductById(session: SessionContext, id: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
      },
      include: {
        category: { select: { id: true, name: true } },
        locations: {
          where: { locationId: session.locationId },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (session.role === 'CASHIER') {
      if (!product.isActive) {
        throw new NotFoundException('Producto no disponible');
      }
      const loc = product.locations[0];
      if (!loc || !loc.isAvailable) {
        throw new NotFoundException('Producto no disponible');
      }
    }

    return this.mapProduct(product);
  }

  async createProduct(session: SessionContext, dto: CreateProductCommand) {
    if (dto.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, tenantId: session.tenantId },
      });
      if (!category) {
        throw new NotFoundException('Categoría no encontrada');
      }
    }

    const trimmedBarcode = dto.barcode?.trim() || null;
    if (trimmedBarcode) {
      const existingBarcode = await this.prisma.product.findFirst({
        where: { tenantId: session.tenantId, barcode: trimmedBarcode },
      });
      if (existingBarcode) {
        throw new ConflictException('El código de barras ya está registrado en este negocio');
      }
    }

    const trimmedSku = dto.sku?.trim() || null;
    if (trimmedSku) {
      const existingSku = await this.prisma.product.findFirst({
        where: { tenantId: session.tenantId, sku: trimmedSku },
      });
      if (existingSku) {
        throw new ConflictException('El código SKU ya está registrado en este negocio');
      }
    }

    if (dto.quickSlot) {
      const existingSlot = await this.prisma.productLocation.findFirst({
        where: {
          locationId: session.locationId,
          quickSlot: dto.quickSlot,
          product: { tenantId: session.tenantId },
        },
      });
      if (existingSlot) {
        throw new ConflictException('El slot rápido ya está ocupado en esta sucursal');
      }
    }

    const initialStockDecimal = toDecimal(dto.initialStock || '0');
    const minStockDecimal = toDecimal(dto.minimumStock || '0');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            tenantId: session.tenantId,
            name: dto.name.trim(),
            normalizedName: normalizeSearchText(dto.name),
            categoryId: dto.categoryId || null,
            barcode: trimmedBarcode,
            sku: trimmedSku,
            salePriceCents: dto.salePriceCents,
            costPriceCents: dto.costPriceCents ?? null,
            unit: dto.unit || 'UNIT',
            isActive: true,
          },
        });

        const productLocation = await tx.productLocation.create({
          data: {
            productId: product.id,
            locationId: session.locationId,
            stockQuantity: initialStockDecimal,
            minimumStock: minStockDecimal,
            quickSlot: dto.quickSlot ?? null,
            isAvailable: dto.isAvailable ?? true,
            version: 1,
          },
        });

        if (!initialStockDecimal.isZero()) {
          await tx.inventoryMovement.create({
            data: {
              tenantId: session.tenantId,
              locationId: session.locationId,
              productId: product.id,
              type: 'INITIAL',
              delta: initialStockDecimal,
              previousStock: new Decimal('0'),
              resultingStock: initialStockDecimal,
              reason: 'Stock inicial al crear el producto',
              userId: session.userId,
            },
          });
        }

        const category = dto.categoryId
          ? await tx.category.findUnique({ where: { id: dto.categoryId } })
          : null;

        return this.mapProduct({
          ...product,
          category,
          locations: [productLocation],
        });
      });
    } catch (err: unknown) {
      this.handlePrismaError(err);
    }
  }

  async updateProduct(session: SessionContext, id: string, dto: UpdateProductCommand) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: session.tenantId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (dto.categoryId) {
      const cat = await this.prisma.category.findFirst({
        where: { id: dto.categoryId, tenantId: session.tenantId },
      });
      if (!cat) {
        throw new NotFoundException('Categoría no encontrada');
      }
    }

    if (dto.barcode !== undefined) {
      const trimmedBarcode = dto.barcode?.trim() || null;
      if (trimmedBarcode && trimmedBarcode !== product.barcode) {
        const collision = await this.prisma.product.findFirst({
          where: {
            tenantId: session.tenantId,
            barcode: trimmedBarcode,
            NOT: { id },
          },
        });
        if (collision) {
          throw new ConflictException('El código de barras ya está registrado en otro producto');
        }
      }
    }

    if (dto.sku !== undefined) {
      const trimmedSku = dto.sku?.trim() || null;
      if (trimmedSku && trimmedSku !== product.sku) {
        const collision = await this.prisma.product.findFirst({
          where: {
            tenantId: session.tenantId,
            sku: trimmedSku,
            NOT: { id },
          },
        });
        if (collision) {
          throw new ConflictException('El código SKU ya está registrado en otro producto');
        }
      }
    }

    const normalizedName = dto.name ? normalizeSearchText(dto.name) : undefined;

    try {
      const updated = await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.name ? { name: dto.name.trim(), normalizedName } : {}),
          ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
          ...(dto.barcode !== undefined ? { barcode: dto.barcode?.trim() || null } : {}),
          ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
          ...(dto.salePriceCents !== undefined ? { salePriceCents: dto.salePriceCents } : {}),
          ...(dto.costPriceCents !== undefined ? { costPriceCents: dto.costPriceCents } : {}),
          ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        include: {
          category: { select: { id: true, name: true } },
          locations: { where: { locationId: session.locationId } },
        },
      });

      return this.mapProduct(updated);
    } catch (err: unknown) {
      this.handlePrismaError(err);
    }
  }

  async updateLocationSettings(
    session: SessionContext,
    id: string,
    dto: UpdateLocationSettingsCommand
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: session.tenantId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    if (dto.quickSlot !== undefined && dto.quickSlot !== null) {
      const collision = await this.prisma.productLocation.findFirst({
        where: {
          locationId: session.locationId,
          quickSlot: dto.quickSlot,
          NOT: { productId: id },
        },
      });
      if (collision) {
        throw new ConflictException('El slot rápido ya está ocupado en esta sucursal');
      }
    }

    try {
      const loc = await this.prisma.productLocation.upsert({
        where: {
          productId_locationId: {
            productId: id,
            locationId: session.locationId,
          },
        },
        create: {
          productId: id,
          locationId: session.locationId,
          stockQuantity: new Decimal('0'),
          minimumStock: dto.minimumStock ? toDecimal(dto.minimumStock) : new Decimal('0'),
          quickSlot: dto.quickSlot ?? null,
          isAvailable: dto.isAvailable ?? true,
          version: 1,
        },
        update: {
          ...(dto.quickSlot !== undefined ? { quickSlot: dto.quickSlot } : {}),
          ...(dto.minimumStock !== undefined ? { minimumStock: toDecimal(dto.minimumStock) } : {}),
          ...(dto.isAvailable !== undefined ? { isAvailable: dto.isAvailable } : {}),
        },
      });

      return this.mapProductLocation(loc);
    } catch (err: unknown) {
      this.handlePrismaError(err);
    }
  }

  async adjustStock(session: SessionContext, productId: string, dto: CreateStockAdjustmentCommand) {
    return await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId: session.tenantId },
      });

      if (!product) {
        throw new NotFoundException('Producto no encontrado');
      }

      let productLocation = await tx.productLocation.findUnique({
        where: {
          productId_locationId: {
            productId,
            locationId: session.locationId,
          },
        },
      });

      if (!productLocation) {
        productLocation = await tx.productLocation.create({
          data: {
            productId,
            locationId: session.locationId,
            stockQuantity: new Decimal('0'),
            minimumStock: new Decimal('0'),
            isAvailable: true,
            version: 1,
          },
        });
      }

      if (dto.expectedVersion !== undefined && productLocation.version !== dto.expectedVersion) {
        throw new ConflictException(
          'Conflicto de concurrencia: el inventario fue modificado por otra operación'
        );
      }

      const currentStock = productLocation.stockQuantity;
      const qty = toDecimal(dto.quantity);
      let resultingStock: Decimal;
      let delta: Decimal;

      switch (dto.type) {
        case 'INITIAL':
          resultingStock = qty;
          delta = qty.minus(currentStock);
          break;
        case 'ADJUSTMENT_IN':
          resultingStock = currentStock.plus(qty);
          delta = qty;
          break;
        case 'ADJUSTMENT_OUT':
          resultingStock = currentStock.minus(qty);
          delta = qty.negated();
          break;
        case 'COUNT_CORRECTION':
          resultingStock = qty;
          delta = qty.minus(currentStock);
          break;
        default:
          throw new ConflictException('Tipo de movimiento inválido');
      }

      if (resultingStock.isNegative()) {
        throw new ConflictException('El stock resultante no puede ser negativo');
      }

      const updateResult = await tx.productLocation.updateMany({
        where: {
          id: productLocation.id,
          version:
            dto.expectedVersion !== undefined ? dto.expectedVersion : productLocation.version,
        },
        data: {
          stockQuantity: resultingStock,
          version: { increment: 1 },
        },
      });

      if (updateResult.count === 0) {
        throw new ConflictException(
          'Conflicto de concurrencia: el inventario fue modificado por otra operación'
        );
      }

      const updatedLoc = await tx.productLocation.findUniqueOrThrow({
        where: { id: productLocation.id },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          tenantId: session.tenantId,
          locationId: session.locationId,
          productId,
          type: dto.type,
          delta,
          previousStock: currentStock,
          resultingStock,
          reason: dto.reason.trim(),
          userId: session.userId,
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      });

      return {
        movement: {
          id: movement.id,
          tenantId: movement.tenantId,
          locationId: movement.locationId,
          productId: movement.productId,
          type: movement.type,
          delta: formatDecimal(movement.delta),
          previousStock: formatDecimal(movement.previousStock),
          resultingStock: formatDecimal(movement.resultingStock),
          reason: movement.reason,
          userId: movement.userId,
          user: movement.user,
          createdAt: movement.createdAt.toISOString(),
        },
        productLocation: this.mapProductLocation(updatedLoc),
      };
    });
  }

  async listStockMovements(session: SessionContext, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId: session.tenantId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        productId,
        locationId: session.locationId,
        tenantId: session.tenantId,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return movements.map((m) => ({
      id: m.id,
      tenantId: m.tenantId,
      locationId: m.locationId,
      productId: m.productId,
      type: m.type,
      delta: formatDecimal(m.delta),
      previousStock: formatDecimal(m.previousStock),
      resultingStock: formatDecimal(m.resultingStock),
      reason: m.reason,
      userId: m.userId,
      user: m.user,
      createdAt: m.createdAt.toISOString(),
    }));
  }
}
