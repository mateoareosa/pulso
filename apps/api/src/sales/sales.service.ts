import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  CreateSaleCommandSchema,
  parseSalesDateRange,
  type CreateSaleCommand,
  type ProcessSaleResponse,
  type SaleResponse,
  type PaginatedSalesResponse,
  type SaleWarning,
  type TenderType,
  type QuerySales,
} from '@pulso/contracts';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const saleRelations = {
  items: true,
  tenders: true,
  user: { select: { id: true, name: true, email: true } },
  adjustments: {
    orderBy: { createdAt: 'asc' as const },
    include: {
      actor: { select: { id: true, name: true, email: true } },
      items: true,
    },
  },
};

type SaleWithAdjustments = Prisma.SaleGetPayload<{ include: typeof saleRelations }>;
type SaleWithoutAdjustments = Prisma.SaleGetPayload<{
  include: {
    items: true;
    tenders: true;
    user: { select: { id: true; name: true; email: true } };
  };
}>;
type SaleWithRelations = SaleWithAdjustments | SaleWithoutAdjustments;

@Injectable()
export class SalesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  public async processSale(
    command: unknown,
    session: SessionContext
  ): Promise<ProcessSaleResponse> {
    if (!session || !session.tenantId || !session.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const parseResult = CreateSaleCommandSchema.safeParse(command);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Invalid sales payload schema',
        errors: parseResult.error.errors,
      });
    }

    const validCommand: CreateSaleCommand = parseResult.data;
    const { tenantId, locationId, userId } = session;
    const { idempotencyKey, items, tenders, totalCents, createdAtUtc, shiftId } = validCommand;

    // 0. Verify location belongs to session tenant
    const location = await this.prisma.location.findFirst({
      where: {
        id: locationId,
        tenantId,
      },
    });
    if (!location) {
      throw new BadRequestException('La sucursal no existe o no pertenece al comercio activo.');
    }

    // 1. Fast path: Check idempotency record before running heavy transaction
    const existingSale = await this.prisma.sale.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
      include: saleRelations,
    });

    if (existingSale) {
      if (existingSale.locationId !== locationId) {
        throw new ConflictException(
          'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
        );
      }
      if (!this.isPayloadEquivalent(existingSale, validCommand)) {
        throw new ConflictException(
          'La clave de idempotencia ya fue utilizada con una venta o contenido diferente.'
        );
      }
      return {
        success: true,
        sale: this.mapSaleToResponse(existingSale),
        idempotentReplay: true,
        warnings: [],
      };
    }

    // 2. Validate line items, product availability, recalculate totals
    const productIds = Array.from(new Set(items.map((it) => it.productId)));

    // Deterministic sorting to prevent deadlocks across concurrent transactions
    const sortedProductIds = [...productIds].sort();

    const MAX_RETRIES = 10;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Double check inside transaction for race conditions
            const concurrencyExisting = await tx.sale.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId,
                  idempotencyKey,
                },
              },
              include: saleRelations,
            });

            if (concurrencyExisting) {
              if (concurrencyExisting.locationId !== locationId) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
                );
              }
              if (!this.isPayloadEquivalent(concurrencyExisting, validCommand)) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada con una venta o contenido diferente.'
                );
              }
              return {
                success: true,
                sale: this.mapSaleToResponse(concurrencyExisting),
                idempotentReplay: true,
                warnings: [],
              };
            }

            // Verify an open cash shift exists for this location
            const activeShift = await tx.cashShift.findFirst({
              where: {
                tenantId,
                locationId,
                status: 'OPEN',
              },
            });

            if (!activeShift) {
              throw new BadRequestException(
                'No hay un turno de caja abierto en esta sucursal. Debe abrir caja antes de registrar ventas.'
              );
            }

            // Fetch products ensuring they belong to current tenant
            const products = await tx.product.findMany({
              where: {
                id: { in: sortedProductIds },
                tenantId,
              },
            });

            if (products.length !== sortedProductIds.length) {
              throw new BadRequestException(
                'Uno o más productos no existen o no pertenecen al comercio activo.'
              );
            }

            for (const p of products) {
              if (!p.isActive) {
                throw new BadRequestException(
                  `El producto "${p.name}" no está activo para la venta.`
                );
              }
            }

            const productMap = new Map(products.map((p) => [p.id, p]));

            // Aggregate quantity requested per product & check mathematical totals
            const qtyPerProduct = new Map<string, Decimal>();
            let recalculatedTotalCents = 0;
            const priceWarnings: SaleWarning[] = [];

            for (const item of items) {
              const product = productMap.get(item.productId);
              if (!product) {
                throw new BadRequestException(`Producto ${item.productId} no encontrado.`);
              }

              const expectedLineTotal = Math.round(item.quantity * item.unitPriceCents);
              if (item.totalPriceCents !== expectedLineTotal) {
                throw new BadRequestException(`Total de línea incorrecto para "${product.name}".`);
              }

              if (item.unitPriceCents !== product.salePriceCents) {
                priceWarnings.push({
                  productId: item.productId,
                  name: product.name,
                  currentStock: '0',
                  belowZero: false,
                  belowMin: false,
                  priceDivergence: {
                    chargedUnitPriceCents: item.unitPriceCents,
                    catalogUnitPriceCents: product.salePriceCents,
                  },
                  message: `Precio cobrado ($${(item.unitPriceCents / 100).toFixed(2)}) difiere del catálogo actual ($${(product.salePriceCents / 100).toFixed(2)}).`,
                });
              }

              recalculatedTotalCents += expectedLineTotal;
              const currentQty = qtyPerProduct.get(item.productId) ?? new Decimal(0);
              qtyPerProduct.set(item.productId, currentQty.plus(new Decimal(item.quantity)));
            }

            if (totalCents !== recalculatedTotalCents) {
              throw new BadRequestException(
                `Total de la venta (${totalCents}) no coincide con el cálculo del servidor (${recalculatedTotalCents}).`
              );
            }

            const totalTendersCents = tenders.reduce((acc, t) => acc + t.amountCents, 0);
            if (totalTendersCents < totalCents) {
              throw new BadRequestException(
                `El importe abonado (${totalTendersCents}) es insuficiente para cubrir la venta (${totalCents}).`
              );
            }

            // Lock and update ProductLocation deterministically in order with CAS version check
            const warnings: SaleWarning[] = [];
            const stockDeltas = new Map<string, { previous: Decimal; resulting: Decimal }>();

            for (const pid of sortedProductIds) {
              const deltaQty = qtyPerProduct.get(pid)!;
              const product = productMap.get(pid)!;

              const pl = await tx.productLocation.findUnique({
                where: {
                  productId_locationId: {
                    productId: pid,
                    locationId,
                  },
                },
              });

              if (!pl) {
                throw new BadRequestException(
                  `El producto "${product.name}" no está configurado en esta sucursal.`
                );
              }

              if (!pl.isAvailable) {
                throw new BadRequestException(
                  `El producto "${product.name}" no está disponible para la venta en esta sucursal.`
                );
              }

              const previousStock = pl.stockQuantity;
              const resultingStock = previousStock.minus(deltaQty);

              // Optimistic Concurrency Control (CAS by version)
              const updateResult = await tx.productLocation.updateMany({
                where: {
                  id: pl.id,
                  version: pl.version,
                },
                data: {
                  stockQuantity: resultingStock,
                  version: { increment: 1 },
                },
              });

              if (updateResult.count === 0) {
                // Version conflict detected concurrently - trigger retry
                throw new Prisma.PrismaClientKnownRequestError(
                  'Transaction failed due to a write conflict or a deadlock',
                  {
                    code: 'P2034',
                    clientVersion: '5.x',
                  }
                );
              }

              stockDeltas.set(pid, { previous: previousStock, resulting: resultingStock });

              const belowZero = resultingStock.isNegative();
              const belowMin = resultingStock.lessThan(pl.minimumStock);
              if (belowZero || belowMin) {
                warnings.push({
                  productId: pid,
                  name: product.name,
                  currentStock: resultingStock.toString(),
                  belowZero,
                  belowMin,
                });
              }
            }

            for (const pw of priceWarnings) {
              const delta = stockDeltas.get(pw.productId);
              if (delta) {
                pw.currentStock = delta.resulting.toString();
              }
              warnings.push(pw);
            }

            // Create Sale record with SERVER snapshots for name and barcode
            const createdSale = await tx.sale.create({
              data: {
                tenantId,
                locationId,
                userId,
                shiftId: shiftId ?? null,
                idempotencyKey,
                totalCents,
                status: 'COMPLETED',
                createdAtUtc: new Date(createdAtUtc),
                items: {
                  create: items.map((it) => {
                    const product = productMap.get(it.productId)!;
                    return {
                      productId: it.productId,
                      name: product.name, // Server snapshot
                      barcode: product.barcode ?? null, // Server snapshot
                      quantity: new Decimal(it.quantity),
                      unitPriceCents: it.unitPriceCents,
                      totalPriceCents: it.totalPriceCents,
                    };
                  }),
                },
                tenders: {
                  create: tenders.map((t) => ({
                    type: t.type,
                    amountCents: t.amountCents,
                    receivedAmountCents: t.receivedAmountCents ?? null,
                    changeAmountCents: t.changeAmountCents ?? null,
                    reference: t.reference ?? null,
                  })),
                },
              },
              include: {
                items: true,
                tenders: true,
                user: { select: { id: true, name: true, email: true } },
              },
            });

            // Create InventoryMovement records for each product
            for (const pid of sortedProductIds) {
              const deltaInfo = stockDeltas.get(pid)!;
              const deltaQty = qtyPerProduct.get(pid)!;

              await tx.inventoryMovement.create({
                data: {
                  tenantId,
                  locationId,
                  productId: pid,
                  saleId: createdSale.id,
                  type: 'SALE',
                  delta: deltaQty.negated(),
                  previousStock: deltaInfo.previous,
                  resultingStock: deltaInfo.resulting,
                  reason: `Venta ${createdSale.id}`,
                  userId,
                },
              });
            }

            // Touch shift to serialize with concurrent closes and ensure row-level conflict detection
            await tx.cashShift.update({
              where: { id: activeShift.id },
              data: { updatedAt: new Date() },
            });

            // Create CashMovement of type SALE if cash was tendered
            const cashAmount = tenders
              .filter((t) => t.type === 'CASH')
              .reduce((sum, t) => sum + t.amountCents, 0);

            if (cashAmount > 0) {
              await tx.cashMovement.create({
                data: {
                  tenantId,
                  locationId,
                  shiftId: activeShift.id,
                  createdByUserId: userId,
                  type: 'SALE',
                  amountCents: cashAmount,
                  signedAmountCents: cashAmount,
                  reason: `Venta ${createdSale.id}`,
                  saleId: createdSale.id,
                  idempotencyKey: `sale-${idempotencyKey}`,
                  createdAtUtc: new Date(createdAtUtc),
                },
              });
            }

            return {
              success: true,
              sale: this.mapSaleToResponse(createdSale),
              idempotentReplay: false,
              warnings,
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 10000,
          }
        );
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002' // Unique constraint violation (e.g. concurrent idempotencyKey)
        ) {
          const replay = await this.prisma.sale.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId,
                idempotencyKey,
              },
            },
            include: {
              items: true,
              tenders: true,
              user: { select: { id: true, name: true, email: true } },
            },
          });
          if (replay) {
            if (replay.locationId !== locationId) {
              throw new ConflictException(
                'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
              );
            }
            if (!this.isPayloadEquivalent(replay, validCommand)) {
              throw new ConflictException(
                'La clave de idempotencia ya fue utilizada con una venta o contenido diferente.'
              );
            }
            return {
              success: true,
              sale: this.mapSaleToResponse(replay),
              idempotentReplay: true,
              warnings: [],
            };
          }
        }

        const isSerializationConflict =
          err instanceof Prisma.PrismaClientKnownRequestError &&
          (err.code === 'P2034' || err.message?.includes('could not serialize access'));

        if (isSerializationConflict && attempt < MAX_RETRIES) {
          continue;
        }

        throw err;
      }
    }

    throw new BadRequestException('No se pudo completar la venta debido a contención concurrente.');
  }

  private isPayloadEquivalent(
    existingSale: {
      locationId: string;
      totalCents: number;
      shiftId?: string | null;
      createdAtUtc?: Date | string | null;
      items: Array<{
        productId: string;
        quantity: Decimal | number | string;
        unitPriceCents: number;
        totalPriceCents: number;
      }>;
      tenders: Array<{
        type: string;
        amountCents: number;
        receivedAmountCents?: number | null;
        changeAmountCents?: number | null;
        reference?: string | null;
      }>;
    },
    command: CreateSaleCommand
  ): boolean {
    if (existingSale.totalCents !== command.totalCents) {
      return false;
    }

    const existingShift = existingSale.shiftId ?? null;
    const commandShift = command.shiftId ?? null;
    if (existingShift !== commandShift) {
      return false;
    }

    if (command.createdAtUtc) {
      const commandTime = new Date(command.createdAtUtc).getTime();
      const existingTime =
        existingSale.createdAtUtc instanceof Date
          ? existingSale.createdAtUtc.getTime()
          : existingSale.createdAtUtc
            ? new Date(existingSale.createdAtUtc).getTime()
            : NaN;
      if (isNaN(commandTime) || isNaN(existingTime) || commandTime !== existingTime) {
        return false;
      }
    }

    if (existingSale.items.length !== command.items.length) {
      return false;
    }

    const sortedExistingItems = [...existingSale.items].sort((a, b) =>
      a.productId.localeCompare(b.productId)
    );
    const sortedCommandItems = [...command.items].sort((a, b) =>
      a.productId.localeCompare(b.productId)
    );

    for (let i = 0; i < sortedExistingItems.length; i++) {
      const eItem = sortedExistingItems[i]!;
      const cItem = sortedCommandItems[i]!;
      if (eItem.productId !== cItem.productId) return false;
      if (Math.abs(Number(eItem.quantity.toString()) - Number(cItem.quantity)) > 0.0001) {
        return false;
      }
      if (eItem.unitPriceCents !== cItem.unitPriceCents) return false;
      if (eItem.totalPriceCents !== cItem.totalPriceCents) return false;
    }

    if (existingSale.tenders.length !== command.tenders.length) {
      return false;
    }

    const sortTenders = <
      T extends {
        type: string;
        amountCents: number;
        receivedAmountCents?: number | null;
        changeAmountCents?: number | null;
        reference?: string | null;
      },
    >(
      list: T[]
    ) => {
      return [...list].sort((a, b) => {
        const typeComp = a.type.localeCompare(b.type);
        if (typeComp !== 0) return typeComp;
        const amountComp = a.amountCents - b.amountCents;
        if (amountComp !== 0) return amountComp;
        const recvA = a.receivedAmountCents ?? 0;
        const recvB = b.receivedAmountCents ?? 0;
        if (recvA !== recvB) return recvA - recvB;
        const refA = a.reference ?? '';
        const refB = b.reference ?? '';
        return refA.localeCompare(refB);
      });
    };

    const sortedExistingTenders = sortTenders(existingSale.tenders);
    const sortedCommandTenders = sortTenders(command.tenders);

    for (let i = 0; i < sortedExistingTenders.length; i++) {
      const eTender = sortedExistingTenders[i]!;
      const cTender = sortedCommandTenders[i]!;
      if (eTender.type !== cTender.type) return false;
      if (eTender.amountCents !== cTender.amountCents) return false;

      const eRecv = eTender.receivedAmountCents ?? null;
      const cRecv = cTender.receivedAmountCents ?? null;
      if (eRecv !== cRecv) return false;

      const eChange = eTender.changeAmountCents ?? null;
      const cChange = cTender.changeAmountCents ?? null;
      if (eChange !== cChange) return false;

      const eRef = eTender.reference ?? null;
      const cRef = cTender.reference ?? null;
      if (eRef !== cRef) return false;
    }

    return true;
  }

  public async getSales(
    session: SessionContext,
    options: QuerySales = { page: 1, limit: 20 }
  ): Promise<PaginatedSalesResponse> {
    const page = options.page ?? 1;
    const limit = options.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.SaleWhereInput = {
      tenantId: session.tenantId,
      locationId: session.locationId,
    };

    if (options?.from || options?.to) {
      try {
        const { fromUtc, toExclusiveUtc } = parseSalesDateRange(options.from, options.to);
        if (fromUtc || toExclusiveUtc) {
          where.createdAtUtc = {
            ...(fromUtc ? { gte: fromUtc } : {}),
            ...(toExclusiveUtc ? { lt: toExclusiveUtc } : {}),
          };
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Parámetros de fecha inválidos.';
        throw new BadRequestException(message);
      }
    }

    if (options?.search) {
      const q = options.search.trim();
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { idempotencyKey: { contains: q, mode: 'insensitive' } },
        { items: { some: { name: { contains: q, mode: 'insensitive' } } } },
        { items: { some: { barcode: { contains: q, mode: 'insensitive' } } } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAtUtc: 'desc' },
        include: saleRelations,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      items: items.map((s) => this.mapSaleToResponse(s)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  public async getSaleById(session: SessionContext, id: string): Promise<SaleResponse> {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
        locationId: session.locationId,
      },
      include: saleRelations,
    });

    if (!sale) {
      throw new NotFoundException('Venta no encontrada.');
    }

    return this.mapSaleToResponse(sale);
  }

  private mapSaleToResponse(sale: SaleWithRelations): SaleResponse {
    return {
      id: sale.id,
      tenantId: sale.tenantId,
      locationId: sale.locationId,
      userId: sale.userId,
      shiftId: sale.shiftId ?? null,
      idempotencyKey: sale.idempotencyKey,
      totalCents: sale.totalCents,
      status: sale.status,
      createdAtUtc:
        sale.createdAtUtc instanceof Date ? sale.createdAtUtc.toISOString() : sale.createdAtUtc,
      persistedAt:
        sale.persistedAt instanceof Date ? sale.persistedAt.toISOString() : sale.persistedAt,
      user: sale.user
        ? {
            id: sale.user.id,
            name: sale.user.name,
            email: sale.user.email,
          }
        : undefined,
      items: sale.items?.map((it) => ({
        id: it.id,
        saleId: it.saleId,
        productId: it.productId,
        name: it.name,
        barcode: it.barcode ?? null,
        quantity: it.quantity ? it.quantity.toString() : '0',
        unitPriceCents: it.unitPriceCents,
        totalPriceCents: it.totalPriceCents,
      })),
      tenders: sale.tenders?.map((t) => ({
        id: t.id,
        saleId: t.saleId,
        type: t.type as TenderType,
        amountCents: t.amountCents,
        receivedAmountCents: t.receivedAmountCents ?? null,
        changeAmountCents: t.changeAmountCents ?? null,
        reference: t.reference ?? null,
      })),
      adjustments: ('adjustments' in sale ? sale.adjustments : undefined)?.map((adjustment) => ({
        id: adjustment.id,
        type: adjustment.type,
        status: adjustment.status,
        reason: adjustment.reason,
        totalCents: adjustment.totalCents,
        refundTender: adjustment.refundTender as TenderType,
        refundStatus: adjustment.refundStatus as 'COMPLETED' | 'PENDING',
        actor: adjustment.actor,
        createdAt:
          adjustment.createdAt instanceof Date
            ? adjustment.createdAt.toISOString()
            : adjustment.createdAt,
        items: adjustment.items.map((item) => ({
          id: item.id,
          saleItemId: item.saleItemId,
          productId: item.productId,
          quantity: item.quantity.toString(),
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        })),
      })),
    };
  }
}
