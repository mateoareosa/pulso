import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  ReturnSaleCommandSchema,
  VoidSaleCommandSchema,
  type ReturnSaleCommand,
  type SaleAdjustmentErrorCode,
  type SaleAdjustmentResponse,
  type TenderType,
  type VoidSaleCommand,
} from '@pulso/contracts';
import type { SessionContext } from '../auth/cookie.utils.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SalesService } from './sales.service.js';

type SourceLine = { id: string; quantity: string | number | Decimal; unitPriceCents: number };
type RequestedLine = { saleItemId: string; quantity: number };
export type ReturnPlanLine = RequestedLine & { unitPriceCents: number; totalCents: number };
type AdjustmentItemRecord = {
  id: string;
  saleItemId: string;
  productId: string;
  quantity: Decimal;
  unitPriceCents: number;
  totalCents: number;
};
type AdjustmentRecord = {
  id: string;
  tenantId: string;
  locationId: string;
  saleId: string;
  type: 'RETURN' | 'VOID';
  status: string;
  reason: string;
  totalCents: number;
  refundTender: string;
  refundStatus: string;
  createdAt: Date | string;
  actor: { id: string; name: string; email: string };
  items: AdjustmentItemRecord[];
};
type InventorySaleRecord = {
  id: string;
  locationId: string;
  items: Array<SourceLine & { productId: string }>;
};

export class SaleAdjustmentDomainError extends Error {
  constructor(
    public readonly code: SaleAdjustmentErrorCode,
    message: string
  ) {
    super(message);
  }
}

export function calculateReturnPlan(
  sourceLines: SourceLine[],
  requestedLines: RequestedLine[],
  alreadyReturned: Record<string, number>
): ReturnPlanLine[] {
  const source = new Map(sourceLines.map((line) => [line.id, line]));
  return requestedLines.map((requested) => {
    const line = source.get(requested.saleItemId);
    const sold = line ? Number(line.quantity) : 0;
    const remaining = sold - (alreadyReturned[requested.saleItemId] ?? 0);
    if (!line || requested.quantity > remaining + Number.EPSILON) {
      throw new SaleAdjustmentDomainError(
        'RETURN_QUANTITY_EXCEEDED',
        'La cantidad solicitada supera la cantidad restante de la línea.'
      );
    }
    return {
      ...requested,
      unitPriceCents: line.unitPriceCents,
      totalCents: Math.round(requested.quantity * line.unitPriceCents),
    };
  });
}

export type RefundPolicy = {
  tender: TenderType;
  status: 'COMPLETED' | 'PENDING';
  requiresCashMovement: boolean;
};

export function resolveRefundPolicy(
  tenders: Array<{ type: string; amountCents: number }>,
  requestedTender?: TenderType
): RefundPolicy {
  const sourceTender = tenders.length === 1 ? tenders[0]?.type : undefined;
  const tender = requestedTender ?? sourceTender ?? 'OTHER';
  if (!['CASH', 'DEBIT', 'CREDIT', 'TRANSFER', 'OTHER'].includes(tender)) {
    throw new SaleAdjustmentDomainError(
      'NON_CASH_REFUND_UNSUPPORTED',
      'El medio de reintegro no es válido.'
    );
  }
  const requiresCashMovement = tender === 'CASH';
  return {
    tender: tender as TenderType,
    status: requiresCashMovement ? 'COMPLETED' : 'PENDING',
    requiresCashMovement,
  };
}

export function areSalesAdjustmentsEnabled(value = process.env.SALES_ADJUSTMENTS_ENABLED): boolean {
  return value?.toLowerCase() !== 'false';
}

function domainException(
  error: SaleAdjustmentDomainError
): BadRequestException | ConflictException {
  const body = { code: error.code, message: error.message };
  return error.code === 'IDEMPOTENCY_CONFLICT' || error.code === 'VOID_AFTER_RETURN'
    ? new ConflictException(body)
    : new BadRequestException(body);
}

const adjustmentInclude = {
  actor: { select: { id: true, name: true, email: true } },
  items: true,
} as const;

@Injectable()
export class SalesAdjustmentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SalesService) private readonly salesService: SalesService
  ) {}

  returnSale(saleId: string, command: unknown, session: SessionContext) {
    if (!areSalesAdjustmentsEnabled()) {
      throw new ServiceUnavailableException(
        'Las devoluciones y anulaciones están temporalmente deshabilitadas.'
      );
    }
    const parsed = ReturnSaleCommandSchema.safeParse(command);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid return payload',
        errors: parsed.error.errors,
      });
    }
    return this.execute('RETURN', saleId, parsed.data, session);
  }

  voidSale(saleId: string, command: unknown, session: SessionContext) {
    if (!areSalesAdjustmentsEnabled()) {
      throw new ServiceUnavailableException(
        'Las devoluciones y anulaciones están temporalmente deshabilitadas.'
      );
    }
    const parsed = VoidSaleCommandSchema.safeParse(command);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid void payload',
        errors: parsed.error.errors,
      });
    }
    return this.execute('VOID', saleId, parsed.data, session);
  }

  private async execute(
    type: 'RETURN' | 'VOID',
    saleId: string,
    command: ReturnSaleCommand | VoidSaleCommand,
    session: SessionContext
  ): Promise<SaleAdjustmentResponse> {
    const db = this.prisma;
    const replay = await db.saleAdjustment.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: session.tenantId,
          idempotencyKey: command.idempotencyKey,
        },
      },
      include: adjustmentInclude,
    });
    if (replay) return this.replayOrConflict(replay, type, saleId, command, session);

    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const outcome = await db.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const concurrentReplay = await tx.saleAdjustment.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId: session.tenantId,
                  idempotencyKey: command.idempotencyKey,
                },
              },
              include: adjustmentInclude,
            });
            if (concurrentReplay) {
              this.assertReplayEquivalent(concurrentReplay, type, saleId, command, session);
              return { adjustment: concurrentReplay, replayed: true };
            }

            const sale = await tx.sale.findUnique({
              where: { id: saleId },
              include: { items: true, tenders: true, adjustments: { include: { items: true } } },
            });
            if (!sale || sale.tenantId !== session.tenantId)
              throw new NotFoundException('Venta no encontrada.');
            if (sale.locationId !== session.locationId) {
              throw new ForbiddenException({
                code: 'LOCATION_SCOPE',
                message: 'La venta pertenece a otra sucursal.',
              });
            }
            if (sale.status !== 'COMPLETED') {
              throw domainException(
                new SaleAdjustmentDomainError('SALE_NOT_COMPLETED', 'La venta no está completada.')
              );
            }
            const refundPolicy = resolveRefundPolicy(
              sale.tenders,
              type === 'RETURN' ? (command as ReturnSaleCommand).refundTender : undefined
            );

            if (type === 'VOID' && sale.adjustments.length > 0) {
              throw domainException(
                new SaleAdjustmentDomainError(
                  'VOID_AFTER_RETURN',
                  'No se puede anular una venta con ajustes previos.'
                )
              );
            }
            if (type === 'RETURN' && sale.adjustments.some((item) => item.type === 'VOID')) {
              throw domainException(
                new SaleAdjustmentDomainError('SALE_NOT_COMPLETED', 'La venta ya fue anulada.')
              );
            }

            const returned: Record<string, number> = {};
            for (const prior of sale.adjustments) {
              for (const item of prior.items) {
                returned[item.saleItemId] =
                  (returned[item.saleItemId] ?? 0) + Number(item.quantity);
              }
            }
            const requested =
              type === 'VOID'
                ? sale.items.map((item) => ({
                    saleItemId: item.id,
                    quantity: Number(item.quantity),
                  }))
                : (command as ReturnSaleCommand).items;
            let plan: ReturnPlanLine[];
            try {
              plan = calculateReturnPlan(sale.items, requested, returned);
            } catch (error) {
              if (error instanceof SaleAdjustmentDomainError) throw domainException(error);
              throw error;
            }
            const totalCents = plan.reduce((sum, line) => sum + line.totalCents, 0);
            const shift = refundPolicy.requiresCashMovement
              ? await tx.cashShift.findFirst({
                  where: {
                    tenantId: session.tenantId,
                    locationId: session.locationId,
                    status: 'OPEN',
                  },
                  orderBy: { openedAtUtc: 'desc' },
                })
              : null;
            if (refundPolicy.requiresCashMovement && !shift) {
              throw domainException(
                new SaleAdjustmentDomainError(
                  'SHIFT_REQUIRED',
                  'Se requiere un turno de caja abierto para reintegrar efectivo.'
                )
              );
            }

            const created = await tx.saleAdjustment.create({
              data: {
                tenantId: session.tenantId,
                locationId: session.locationId,
                saleId,
                actorUserId: session.userId,
                shiftId: shift?.id ?? null,
                idempotencyKey: command.idempotencyKey,
                type,
                status: refundPolicy.status,
                reason: command.reason,
                totalCents,
                refundTender: refundPolicy.tender,
                refundStatus: refundPolicy.status,
                items: {
                  create: plan.map((line) => {
                    const source = sale.items.find((item) => item.id === line.saleItemId)!;
                    return { ...line, productId: source.productId };
                  }),
                },
              },
              include: adjustmentInclude,
            });

            await this.appendInventoryReturns(tx, sale, plan, created.id, command.reason, session);
            if (refundPolicy.requiresCashMovement && shift) {
              await this.appendCashRefund(
                tx,
                sale,
                created.id,
                shift.id,
                totalCents,
                command.reason,
                session
              );
            }
            return { adjustment: created, replayed: false };
          },
          { isolationLevel: 'Serializable', timeout: 10000 }
        );

        return this.response(outcome.adjustment, session, outcome.replayed || attempt > 1);
      } catch (error: unknown) {
        const databaseError = error as { code?: string; message?: string };
        if (
          (databaseError.code === 'P2034' || String(databaseError.message).includes('serialize')) &&
          attempt < maxAttempts
        )
          continue;
        if (databaseError.code === 'P2002') {
          const winner = await db.saleAdjustment.findUnique({
            where: {
              tenantId_idempotencyKey: {
                tenantId: session.tenantId,
                idempotencyKey: command.idempotencyKey,
              },
            },
            include: adjustmentInclude,
          });
          if (winner) return this.replayOrConflict(winner, type, saleId, command, session);
        }
        throw error;
      }
    }
    throw new ConflictException('No se pudo completar el ajuste por contención concurrente.');
  }

  private async appendInventoryReturns(
    tx: Prisma.TransactionClient,
    sale: InventorySaleRecord,
    plan: ReturnPlanLine[],
    adjustmentId: string,
    reason: string,
    session: SessionContext
  ) {
    for (const line of [...plan].sort((a, b) => a.saleItemId.localeCompare(b.saleItemId))) {
      const source = sale.items.find((item) => item.id === line.saleItemId)!;
      const stock = await tx.productLocation.findUnique({
        where: {
          productId_locationId: { productId: source.productId, locationId: sale.locationId },
        },
      });
      if (!stock)
        throw new BadRequestException('No existe stock de la línea en la sucursal de origen.');
      const quantity = new Decimal(line.quantity);
      const resulting = stock.stockQuantity.plus(quantity);
      const updated = await tx.productLocation.updateMany({
        where: { id: stock.id, version: stock.version },
        data: { stockQuantity: resulting, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new Prisma.PrismaClientKnownRequestError('Write conflict', {
          code: 'P2034',
          clientVersion: '6',
        });
      }
      await tx.inventoryMovement.create({
        data: {
          tenantId: session.tenantId,
          locationId: sale.locationId,
          productId: source.productId,
          saleId: sale.id,
          saleAdjustmentId: adjustmentId,
          type: 'RETURN',
          delta: quantity,
          previousStock: stock.stockQuantity,
          resultingStock: resulting,
          reason,
          userId: session.userId,
        },
      });
    }
  }

  private async appendCashRefund(
    tx: Prisma.TransactionClient,
    sale: InventorySaleRecord,
    adjustmentId: string,
    shiftId: string,
    totalCents: number,
    reason: string,
    session: SessionContext
  ) {
    await tx.cashMovement.create({
      data: {
        tenantId: session.tenantId,
        locationId: sale.locationId,
        shiftId,
        createdByUserId: session.userId,
        type: 'REFUND',
        amountCents: totalCents,
        signedAmountCents: -totalCents,
        reason,
        saleId: sale.id,
        saleAdjustmentId: adjustmentId,
        idempotencyKey: `sale-adjustment:${adjustmentId}`,
      },
    });
  }

  private assertReplayEquivalent(
    adjustment: AdjustmentRecord,
    type: string,
    saleId: string,
    command: ReturnSaleCommand | VoidSaleCommand,
    session: SessionContext
  ) {
    const requested =
      type === 'RETURN'
        ? [...(command as ReturnSaleCommand).items].sort((a, b) =>
            a.saleItemId.localeCompare(b.saleItemId)
          )
        : null;
    const stored =
      type === 'RETURN'
        ? adjustment.items
            .map((item) => ({ saleItemId: item.saleItemId, quantity: Number(item.quantity) }))
            .sort((a, b) => a.saleItemId.localeCompare(b.saleItemId))
        : null;
    if (
      adjustment.locationId !== session.locationId ||
      adjustment.saleId !== saleId ||
      adjustment.type !== type ||
      adjustment.reason !== command.reason ||
      JSON.stringify(stored) !== JSON.stringify(requested)
    ) {
      throw domainException(
        new SaleAdjustmentDomainError(
          'IDEMPOTENCY_CONFLICT',
          'La clave de idempotencia ya fue usada con otra operación.'
        )
      );
    }
  }

  private async replayOrConflict(
    adjustment: AdjustmentRecord,
    type: string,
    saleId: string,
    command: ReturnSaleCommand | VoidSaleCommand,
    session: SessionContext
  ) {
    this.assertReplayEquivalent(adjustment, type, saleId, command, session);
    return this.response(adjustment, session, true);
  }

  private async response(
    adjustment: AdjustmentRecord,
    session: SessionContext,
    idempotentReplay: boolean
  ): Promise<SaleAdjustmentResponse> {
    const sale = await this.salesService.getSaleById(session, adjustment.saleId);
    return {
      adjustment: {
        id: adjustment.id,
        type: adjustment.type,
        status: adjustment.status as 'COMPLETED' | 'PENDING',
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
          ...item,
          quantity: item.quantity.toString(),
        })),
      },
      sale,
      idempotentReplay,
    };
  }
}
