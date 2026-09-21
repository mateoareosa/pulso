import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, Purchase, PurchaseItem, Product } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  CreatePurchaseDraftCommand,
  UpdatePurchaseDraftCommand,
  ReceivePurchaseCommand,
  CancelPurchaseCommand,
  QueryPurchases,
  PurchaseResponse,
  PurchaseDetailResponse,
  PaginatedPurchasesResponse,
} from '@pulso/contracts';

type PurchaseWithRelations = Purchase & {
  supplier?: { id: string; name: string; taxId: string | null };
  createdByUser?: { id: string; name: string; email: string };
  receivedByUser?: { id: string; name: string; email: string } | null;
  items?: (PurchaseItem & {
    product?: Product & {
      locations?: Array<{
        stockQuantity: Decimal;
        salePriceCents?: number;
        lastCostCents?: number | null;
      }>;
    };
  })[];
};

@Injectable()
export class PurchasesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createDraft(
    command: CreatePurchaseDraftCommand,
    session: SessionContext
  ): Promise<PurchaseDetailResponse> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const { tenantId, locationId, userId } = session;
    const {
      supplierId,
      documentNumber,
      purchasedAtUtc,
      discountCents,
      additionalCostCents,
      paymentSource,
      notes,
      items,
    } = command;

    // Validate supplier exists, is active, belongs to tenant
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
    });

    if (!supplier) {
      throw new NotFoundException('Proveedor no encontrado.');
    }

    if (!supplier.isActive) {
      throw new BadRequestException('No se pueden crear compras para un proveedor inactivo.');
    }

    // Validate products belong to tenant
    const productIds = items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: {
        id: { in: productIds },
        tenantId,
      },
    });

    if (products.length !== productIds.length) {
      throw new BadRequestException('Uno o más productos no existen o no pertenecen al comercio.');
    }

    const productMap = new Map<string, Product>();
    for (const p of products) {
      productMap.set(p.id, p);
    }

    // Calculate line totals and subtotal strictly on backend
    let subtotalCents = 0;
    const itemsData = items.map((line) => {
      const p = productMap.get(line.productId)!;
      const lineTotalCents = line.quantity * line.unitCostCents;
      subtotalCents += lineTotalCents;
      return {
        productId: line.productId,
        productNameSnapshot: p.name,
        barcodeSnapshot: p.barcode,
        quantity: line.quantity,
        unitCostCents: line.unitCostCents,
        lineTotalCents,
      };
    });

    const totalCents = subtotalCents - discountCents + additionalCostCents;
    if (totalCents < 0) {
      throw new BadRequestException('El total de la compra no puede ser negativo.');
    }

    const purchasedDate = purchasedAtUtc ? new Date(purchasedAtUtc) : new Date();

    const created = await this.prisma.purchase.create({
      data: {
        tenantId,
        locationId,
        supplierId,
        status: 'DRAFT',
        documentNumber: documentNumber?.trim() || null,
        purchasedAtUtc: purchasedDate,
        createdByUserId: userId,
        subtotalCents,
        discountCents,
        additionalCostCents,
        totalCents,
        paymentSource: paymentSource || 'UNSPECIFIED',
        notes: notes?.trim() || null,
        items: {
          create: itemsData,
        },
      },
      include: {
        supplier: { select: { id: true, name: true, taxId: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
        items: true,
      },
    });

    return this.mapPurchaseToDetailResponse(created);
  }

  async updateDraft(
    id: string,
    command: UpdatePurchaseDraftCommand,
    expectedVersion: number,
    session: SessionContext
  ): Promise<PurchaseDetailResponse> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesi�n con tenantId y locationId es obligatorio.');
    }

    const { tenantId, locationId } = session;

    const purchase = await this.prisma.purchase.findFirst({
      where: { id, tenantId, locationId },
      include: { items: true },
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }

    if (purchase.status !== 'DRAFT') {
      throw new ConflictException('Solo se pueden modificar compras en estado BORRADOR (DRAFT).');
    }

    if (purchase.version !== expectedVersion) {
      throw new ConflictException('La compra fue modificada por otra operación.');
    }

    let supplierId = purchase.supplierId;
    if (command.supplierId && command.supplierId !== purchase.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: command.supplierId, tenantId },
      });
      if (!supplier) {
        throw new NotFoundException('Proveedor no encontrado.');
      }
      if (!supplier.isActive) {
        throw new BadRequestException('No se puede asignar un proveedor inactivo.');
      }
      supplierId = command.supplierId;
    }

    let itemsData: Array<{
      productId: string;
      productNameSnapshot: string;
      barcodeSnapshot: string | null;
      quantity: number;
      unitCostCents: number;
      lineTotalCents: number;
    }> | null = null;

    let subtotalCents = purchase.subtotalCents;

    if (command.items) {
      const productIds = command.items.map((i) => i.productId);
      const products = await this.prisma.product.findMany({
        where: { id: { in: productIds }, tenantId },
      });

      if (products.length !== productIds.length) {
        throw new BadRequestException(
          'Uno o m�s productos no existen o no pertenecen al comercio.'
        );
      }

      const productMap = new Map<string, Product>();
      for (const p of products) {
        productMap.set(p.id, p);
      }

      subtotalCents = 0;
      itemsData = command.items.map((line) => {
        const p = productMap.get(line.productId)!;
        const lineTotalCents = line.quantity * line.unitCostCents;
        subtotalCents += lineTotalCents;
        return {
          productId: line.productId,
          productNameSnapshot: p.name,
          barcodeSnapshot: p.barcode,
          quantity: line.quantity,
          unitCostCents: line.unitCostCents,
          lineTotalCents,
        };
      });
    }

    const discountCents =
      command.discountCents !== undefined ? command.discountCents : purchase.discountCents;
    const additionalCostCents =
      command.additionalCostCents !== undefined
        ? command.additionalCostCents
        : purchase.additionalCostCents;
    const totalCents = subtotalCents - discountCents + additionalCostCents;

    if (totalCents < 0) {
      throw new BadRequestException('El total de la compra no puede ser negativo.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const guarded = await tx.purchase.updateMany({
        where: { id, tenantId, locationId, status: 'DRAFT', version: expectedVersion },
        data: {
          supplierId,
          ...(command.documentNumber !== undefined
            ? { documentNumber: command.documentNumber?.trim() || null }
            : {}),
          ...(command.purchasedAtUtc ? { purchasedAtUtc: new Date(command.purchasedAtUtc) } : {}),
          ...(command.paymentSource ? { paymentSource: command.paymentSource } : {}),
          ...(command.notes !== undefined ? { notes: command.notes?.trim() || null } : {}),
          subtotalCents,
          discountCents,
          additionalCostCents,
          totalCents,
          version: { increment: 1 },
        },
      });

      if (guarded.count !== 1) {
        await this.throwPurchaseTransitionFailure(tx, id, tenantId, locationId);
      }

      if (itemsData) {
        await tx.purchaseItem.deleteMany({
          where: { purchaseId: id },
        });
        await tx.purchaseItem.createMany({
          data: itemsData.map((item) => ({ ...item, purchaseId: id })),
        });
      }

      return await tx.purchase.findUniqueOrThrow({
        where: { id },
        include: {
          supplier: { select: { id: true, name: true, taxId: true } },
          createdByUser: { select: { id: true, name: true, email: true } },
          items: true,
        },
      });
    });

    return this.mapPurchaseToDetailResponse(updated);
  }

  async cancelPurchase(
    id: string,
    command: CancelPurchaseCommand,
    session: SessionContext
  ): Promise<PurchaseDetailResponse> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesi�n con tenantId y locationId es obligatorio.');
    }

    const { tenantId, locationId, userId } = session;

    const purchase = await this.prisma.purchase.findFirst({
      where: { id, tenantId, locationId },
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }

    if (purchase.status !== 'DRAFT') {
      throw new ConflictException('Solo se pueden cancelar compras en estado BORRADOR (DRAFT).');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const guarded = await tx.purchase.updateMany({
        where: { id, tenantId, locationId, status: 'DRAFT', version: purchase.version },
        data: {
          status: 'CANCELLED',
          cancelledByUserId: userId,
          cancelledAtUtc: new Date(),
          notes: command.reason
            ? `${purchase.notes ? purchase.notes + ' | ' : ''}Cancelaci�n: ${command.reason}`
            : purchase.notes,
          version: { increment: 1 },
        },
      });

      if (guarded.count !== 1) {
        await this.throwPurchaseTransitionFailure(tx, id, tenantId, locationId);
      }

      return await tx.purchase.findUniqueOrThrow({
        where: { id },
        include: {
          supplier: { select: { id: true, name: true, taxId: true } },
          createdByUser: { select: { id: true, name: true, email: true } },
          items: true,
        },
      });
    });

    return this.mapPurchaseToDetailResponse(updated);
  }

  /**
   * Receive a draft purchase transactionally:
   * - Increments stock in ProductLocation
   * - Updates lastCostCents in ProductLocation
   * - Creates InventoryMovement records (type: PURCHASE)
   * - If paymentSource === 'CASH_REGISTER': validates open cash shift, sufficient expected balance, creates CASH_OUT CashMovement
   * - Marks purchase as RECEIVED
   * - Supports idempotent retries via idempotencyKey
   */
  async receivePurchase(
    id: string,
    command: ReceivePurchaseCommand,
    session: SessionContext
  ): Promise<{ success: boolean; purchase: PurchaseDetailResponse; idempotentReplay: boolean }> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const { tenantId, locationId, userId } = session;
    const { idempotencyKey } = command;

    // Fast path: Idempotency replay check
    const existingWithIdempotency = await this.prisma.purchase.findFirst({
      where: {
        tenantId,
        locationId,
        idempotencyKey,
      },
      include: {
        supplier: { select: { id: true, name: true, taxId: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
        receivedByUser: { select: { id: true, name: true, email: true } },
        items: true,
      },
    });

    if (existingWithIdempotency) {
      if (existingWithIdempotency.id !== id) {
        throw new ConflictException('La clave de idempotencia ya fue utilizada para otra compra.');
      }
      if (existingWithIdempotency.status === 'RECEIVED') {
        return {
          success: true,
          purchase: this.mapPurchaseToDetailResponse(existingWithIdempotency),
          idempotentReplay: true,
        };
      }
    }

    const receiveCandidate = await this.prisma.purchase.findFirst({
      where: { id, tenantId, locationId },
      select: { version: true, status: true },
    });

    if (!receiveCandidate) {
      throw new NotFoundException('Compra no encontrada.');
    }

    const expectedDraftVersion =
      receiveCandidate.status === 'DRAFT' ? receiveCandidate.version : null;

    const MAX_RETRIES = 10;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const purchase = await tx.purchase.findFirst({
              where: { id, tenantId, locationId },
              include: {
                supplier: true,
                items: true,
              },
            });

            if (!purchase) {
              throw new NotFoundException('Compra no encontrada.');
            }

            if (purchase.status === 'RECEIVED') {
              if (purchase.idempotencyKey === idempotencyKey) {
                const fullReceived = await tx.purchase.findUniqueOrThrow({
                  where: { id },
                  include: {
                    supplier: { select: { id: true, name: true, taxId: true } },
                    createdByUser: { select: { id: true, name: true, email: true } },
                    receivedByUser: { select: { id: true, name: true, email: true } },
                    items: true,
                  },
                });
                return {
                  success: true,
                  purchase: this.mapPurchaseToDetailResponse(fullReceived),
                  idempotentReplay: true,
                };
              }
              throw new ConflictException('La compra ya fue confirmada y recibida previamente.');
            }

            if (purchase.status === 'CANCELLED') {
              throw new BadRequestException('No se puede recibir una compra cancelada.');
            }

            if (!purchase.supplier.isActive) {
              throw new BadRequestException(
                'No se puede recibir una compra con un proveedor inactivo.'
              );
            }

            const paymentSource = command.paymentSource || purchase.paymentSource;

            let activeShiftId: string | null = null;
            let cashMovementId: string | null = null;

            if (paymentSource === 'CASH_REGISTER') {
              const activeShift = await tx.cashShift.findFirst({
                where: {
                  tenantId,
                  locationId,
                  status: 'OPEN',
                },
              });

              if (!activeShift) {
                throw new BadRequestException(
                  'No hay un turno de caja abierto en esta sucursal. Para abonar la compra desde caja, abra un turno.'
                );
              }

              // Compute expected cash balance in shift
              const movements = await tx.cashMovement.findMany({
                where: { shiftId: activeShift.id },
              });

              const currentExpected =
                activeShift.openingAmountCents +
                movements
                  .filter((m) => m.type === 'SALE' || m.type === 'CASH_IN')
                  .reduce((sum, m) => sum + m.amountCents, 0) -
                movements
                  .filter((m) => m.type === 'CASH_OUT')
                  .reduce((sum, m) => sum + m.amountCents, 0);

              if (currentExpected - purchase.totalCents < 0) {
                throw new BadRequestException(
                  `Saldo insuficiente en caja para abonar la compra. Saldo actual: $${(
                    currentExpected / 100
                  ).toFixed(2)}, total requerido: $${(purchase.totalCents / 100).toFixed(2)}.`
                );
              }

              // Touch shift to serialize with concurrent closes and other movements
              await tx.cashShift.update({
                where: { id: activeShift.id },
                data: { updatedAt: new Date() },
              });

              const cashOut = await tx.cashMovement.create({
                data: {
                  tenantId,
                  locationId,
                  shiftId: activeShift.id,
                  createdByUserId: userId,
                  type: 'CASH_OUT',
                  amountCents: purchase.totalCents,
                  signedAmountCents: -purchase.totalCents,
                  reason: `Compra #${purchase.id.slice(-6)} a proveedor ${purchase.supplier.name}`,
                  purchaseId: purchase.id,
                  idempotencyKey: `purchase-cash-${idempotencyKey}`,
                  createdAtUtc: new Date(),
                },
              });

              activeShiftId = activeShift.id;
              cashMovementId = cashOut.id;
            }

            // Deterministic sort of items by productId to reduce deadlocks
            const sortedItems = [...purchase.items].sort((a, b) =>
              a.productId.localeCompare(b.productId)
            );
            const now = new Date();

            for (const item of sortedItems) {
              // Fetch or create ProductLocation
              const productLocation = await tx.productLocation.findUnique({
                where: {
                  productId_locationId: {
                    productId: item.productId,
                    locationId,
                  },
                },
              });

              const previousStock = productLocation
                ? productLocation.stockQuantity
                : new Decimal(0);
              const delta = new Decimal(item.quantity);
              const resultingStock = previousStock.plus(delta);

              if (productLocation) {
                await tx.productLocation.update({
                  where: { id: productLocation.id },
                  data: {
                    stockQuantity: resultingStock,
                    lastCostCents: item.unitCostCents,
                    version: { increment: 1 },
                  },
                });
              } else {
                await tx.productLocation.create({
                  data: {
                    productId: item.productId,
                    locationId,
                    stockQuantity: resultingStock,
                    lastCostCents: item.unitCostCents,
                    version: 1,
                  },
                });
              }

              // Create InventoryMovement of type PURCHASE
              await tx.inventoryMovement.create({
                data: {
                  tenantId,
                  locationId,
                  productId: item.productId,
                  purchaseId: purchase.id,
                  purchaseItemId: item.id,
                  type: 'PURCHASE',
                  delta,
                  previousStock,
                  resultingStock,
                  reason: `Recepción de compra #${purchase.id.slice(-6)}`,
                  userId,
                  createdAt: now,
                },
              });
            }

            // Update Purchase to RECEIVED after all side effects, guarded by the DRAFT row version read in this transaction.
            const guarded = await tx.purchase.updateMany({
              where: {
                id,
                tenantId,
                locationId,
                status: 'DRAFT',
                version: expectedDraftVersion ?? purchase.version,
              },
              data: {
                status: 'RECEIVED',
                receivedAtUtc: now,
                receivedByUserId: userId,
                paymentSource,
                cashShiftId: activeShiftId,
                cashMovementId,
                idempotencyKey,
                version: { increment: 1 },
              },
            });

            if (guarded.count !== 1) {
              await this.throwPurchaseTransitionFailure(tx, id, tenantId, locationId);
            }

            const updatedPurchase = await tx.purchase.findUniqueOrThrow({
              where: { id },
              include: {
                supplier: { select: { id: true, name: true, taxId: true } },
                createdByUser: { select: { id: true, name: true, email: true } },
                receivedByUser: { select: { id: true, name: true, email: true } },
                items: true,
              },
            });

            return {
              success: true,
              purchase: this.mapPurchaseToDetailResponse(updatedPurchase),
              idempotentReplay: false,
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 15000,
          }
        );
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2002') {
            // Check idempotency record
            const replay = await this.prisma.purchase.findFirst({
              where: {
                tenantId,
                locationId,
                idempotencyKey,
              },
              include: {
                supplier: { select: { id: true, name: true, taxId: true } },
                createdByUser: { select: { id: true, name: true, email: true } },
                receivedByUser: { select: { id: true, name: true, email: true } },
                items: true,
              },
            });

            if (replay && replay.id === id && replay.status === 'RECEIVED') {
              return {
                success: true,
                purchase: this.mapPurchaseToDetailResponse(replay),
                idempotentReplay: true,
              };
            }

            throw new ConflictException('Conflicto de clave de idempotencia o concurrencia.');
          }

          if (err.code === 'P2034' || err.message?.includes('could not serialize access')) {
            if (attempt < MAX_RETRIES) {
              continue;
            }
          }
        }

        throw err;
      }
    }

    throw new BadRequestException(
      'No se pudo confirmar la recepción debido a contención concurrente.'
    );
  }

  private async throwPurchaseTransitionFailure(
    tx: Prisma.TransactionClient,
    id: string,
    tenantId: string,
    locationId: string
  ): Promise<never> {
    const scoped = await tx.purchase.findFirst({
      where: { id, tenantId, locationId },
      select: { id: true },
    });

    if (!scoped) {
      throw new NotFoundException('Compra no encontrada.');
    }

    throw new ConflictException('La compra ya no est� disponible para esta transici�n.');
  }

  async getPurchases(
    query: QueryPurchases,
    session: SessionContext
  ): Promise<PaginatedPurchasesResponse> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const { tenantId, locationId } = session;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.PurchaseWhereInput = {
      tenantId,
      locationId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.supplierId) {
      where.supplierId = query.supplierId;
    }

    if (query.from || query.to) {
      where.purchasedAtUtc = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(new Date(query.to).getTime() + 86400000) } : {}),
      };
    }

    if (query.search && query.search.trim().length > 0) {
      const s = query.search.trim();
      where.OR = [
        { documentNumber: { contains: s, mode: 'insensitive' } },
        { supplier: { name: { contains: s, mode: 'insensitive' } } },
        { notes: { contains: s, mode: 'insensitive' } },
      ];
    }

    const total = await this.prisma.purchase.count({ where });

    const items = await this.prisma.purchase.findMany({
      where,
      orderBy: [{ purchasedAtUtc: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        supplier: { select: { id: true, name: true, taxId: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
        receivedByUser: { select: { id: true, name: true, email: true } },
        _count: { select: { items: true } },
      },
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map((p) => this.mapPurchaseToSummaryResponse(p)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getPurchaseById(id: string, session: SessionContext): Promise<PurchaseDetailResponse> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const purchase = await this.prisma.purchase.findFirst({
      where: { id, tenantId: session.tenantId, locationId: session.locationId },
      include: {
        supplier: { select: { id: true, name: true, taxId: true } },
        createdByUser: { select: { id: true, name: true, email: true } },
        receivedByUser: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: {
              include: {
                locations: {
                  where: { locationId: session.locationId },
                },
              },
            },
          },
        },
      },
    });

    if (!purchase) {
      throw new NotFoundException('Compra no encontrada.');
    }

    return this.mapPurchaseToDetailResponse(purchase);
  }

  private mapPurchaseToSummaryResponse(
    p: Purchase & {
      supplier?: { id: string; name: string; taxId: string | null };
      createdByUser?: { id: string; name: string; email: string };
      receivedByUser?: { id: string; name: string; email: string } | null;
      _count?: { items: number };
    }
  ): PurchaseResponse {
    return {
      id: p.id,
      tenantId: p.tenantId,
      locationId: p.locationId,
      supplierId: p.supplierId,
      supplier: p.supplier,
      status: p.status,
      documentNumber: p.documentNumber,
      purchasedAtUtc: p.purchasedAtUtc.toISOString(),
      receivedAtUtc: p.receivedAtUtc ? p.receivedAtUtc.toISOString() : null,
      createdByUserId: p.createdByUserId,
      createdByUser: p.createdByUser,
      receivedByUserId: p.receivedByUserId,
      receivedByUser: p.receivedByUser,
      cancelledByUserId: p.cancelledByUserId,
      cancelledAtUtc: p.cancelledAtUtc ? p.cancelledAtUtc.toISOString() : null,
      subtotalCents: p.subtotalCents,
      discountCents: p.discountCents,
      additionalCostCents: p.additionalCostCents,
      totalCents: p.totalCents,
      paymentSource: p.paymentSource,
      cashShiftId: p.cashShiftId,
      cashMovementId: p.cashMovementId,
      idempotencyKey: p.idempotencyKey,
      notes: p.notes,
      itemsCount: p._count?.items,
      version: p.version,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private mapPurchaseToDetailResponse(p: PurchaseWithRelations): PurchaseDetailResponse {
    const items = (p.items || []).map((it) => {
      const loc = it.product?.locations?.[0];
      return {
        id: it.id,
        purchaseId: it.purchaseId,
        productId: it.productId,
        productNameSnapshot: it.productNameSnapshot,
        barcodeSnapshot: it.barcodeSnapshot,
        quantity: it.quantity,
        unitCostCents: it.unitCostCents,
        lineTotalCents: it.lineTotalCents,
        currentStock: loc ? loc.stockQuantity.toString() : undefined,
        salePriceCents: it.product?.salePriceCents,
        lastCostCents: loc ? loc.lastCostCents : undefined,
        createdAt: it.createdAt.toISOString(),
      };
    });

    return {
      ...this.mapPurchaseToSummaryResponse(p),
      items,
    };
  }
}
