import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma, CashShift, CashMovement } from '@prisma/client';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  OpenCashShiftCommand,
  CloseCashShiftCommand,
  CreateCashMovementCommand,
  QueryCashShifts,
  CashShiftResponse,
  CashMovementResponse,
  PaginatedCashShiftsResponse,
  parseSalesDateRange,
} from '@pulso/contracts';

type CashShiftWithRelations = CashShift & {
  openedByUser?: { id: string; name: string; email: string };
  closedByUser?: { id: string; name: string; email: string } | null;
  movements?: CashMovement[];
};

@Injectable()
export class CashService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Get the current active open shift for the location in session.
   * Returns null if no shift is currently open.
   */
  async getActiveShift(session: SessionContext): Promise<CashShiftResponse | null> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const shift = await this.prisma.cashShift.findFirst({
      where: {
        tenantId: session.tenantId,
        locationId: session.locationId,
        status: 'OPEN',
      },
      include: {
        openedByUser: { select: { id: true, name: true, email: true } },
        closedByUser: { select: { id: true, name: true, email: true } },
        movements: {
          orderBy: { createdAtUtc: 'asc' },
          include: {
            createdByUser: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!shift) {
      return null;
    }

    return this.mapShiftToResponse(shift);
  }

  /**
   * Open a new cash shift.
   * Guarantees at most ONE open shift per tenant + location.
   * Creates OPENING movement in the same transaction.
   * Supports idempotent retries.
   */
  async openShift(
    command: OpenCashShiftCommand,
    session: SessionContext
  ): Promise<{ success: boolean; shift: CashShiftResponse; idempotentReplay: boolean }> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const { tenantId, locationId, userId } = session;
    const { openingAmountCents, idempotencyKey } = command;

    // Fast path: Check idempotency record before transaction
    const existingMovement = await this.prisma.cashMovement.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
      include: {
        shift: {
          include: {
            openedByUser: { select: { id: true, name: true, email: true } },
            closedByUser: { select: { id: true, name: true, email: true } },
            movements: {
              orderBy: { createdAtUtc: 'asc' },
              include: {
                createdByUser: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (existingMovement) {
      if (
        existingMovement.type !== 'OPENING' ||
        existingMovement.amountCents !== openingAmountCents
      ) {
        throw new ConflictException(
          'La clave de idempotencia ya fue utilizada con una operación o monto diferente.'
        );
      }
      if (existingMovement.locationId !== locationId) {
        throw new ConflictException(
          'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
        );
      }
      return {
        success: true,
        shift: this.mapShiftToResponse(existingMovement.shift),
        idempotentReplay: true,
      };
    }

    const MAX_RETRIES = 10;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Check if there is already an open shift in this location
            const currentOpen = await tx.cashShift.findFirst({
              where: {
                tenantId,
                locationId,
                status: 'OPEN',
              },
            });

            if (currentOpen) {
              throw new ConflictException(
                'Ya existe un turno de caja abierto en esta sucursal. Debe cerrarlo antes de abrir uno nuevo.'
              );
            }

            // Double check idempotency in tx
            const inTxExisting = await tx.cashMovement.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId,
                  idempotencyKey,
                },
              },
              include: {
                shift: {
                  include: {
                    openedByUser: { select: { id: true, name: true, email: true } },
                    closedByUser: { select: { id: true, name: true, email: true } },
                    movements: {
                      orderBy: { createdAtUtc: 'asc' },
                      include: {
                        createdByUser: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
              },
            });

            if (inTxExisting) {
              if (inTxExisting.locationId !== locationId) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
                );
              }
              if (
                inTxExisting.type !== 'OPENING' ||
                inTxExisting.amountCents !== openingAmountCents
              ) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada con una operación o monto diferente.'
                );
              }
              return {
                success: true,
                shift: this.mapShiftToResponse(inTxExisting.shift),
                idempotentReplay: true,
              };
            }

            const now = new Date();

            const createdShift = await tx.cashShift.create({
              data: {
                tenantId,
                locationId,
                openedByUserId: userId,
                status: 'OPEN',
                openingAmountCents,
                openedAtUtc: now,
              },
              include: {
                openedByUser: { select: { id: true, name: true, email: true } },
                closedByUser: { select: { id: true, name: true, email: true } },
              },
            });

            const movement = await tx.cashMovement.create({
              data: {
                tenantId,
                locationId,
                shiftId: createdShift.id,
                createdByUserId: userId,
                type: 'OPENING',
                amountCents: openingAmountCents,
                signedAmountCents: openingAmountCents,
                reason: 'Fondo inicial de caja',
                idempotencyKey,
                createdAtUtc: now,
              },
              include: {
                createdByUser: { select: { id: true, name: true, email: true } },
              },
            });

            const shiftWithMovements = {
              ...createdShift,
              movements: [movement],
            };

            return {
              success: true,
              shift: this.mapShiftToResponse(shiftWithMovements),
              idempotentReplay: false,
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 10000,
          }
        );
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          // P2002: unique constraint on (tenantId, locationId) WHERE status = 'OPEN'
          // or unique constraint on (tenantId, idempotencyKey)
          if (err.code === 'P2002') {
            const replay = await this.prisma.cashMovement.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId,
                  idempotencyKey,
                },
              },
              include: {
                shift: {
                  include: {
                    openedByUser: { select: { id: true, name: true, email: true } },
                    closedByUser: { select: { id: true, name: true, email: true } },
                    movements: {
                      orderBy: { createdAtUtc: 'asc' },
                      include: {
                        createdByUser: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
              },
            });

            if (replay) {
              if (replay.locationId !== locationId) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
                );
              }
              if (replay.type !== 'OPENING' || replay.amountCents !== openingAmountCents) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada con una operación o monto diferente.'
                );
              }
              return {
                success: true,
                shift: this.mapShiftToResponse(replay.shift),
                idempotentReplay: true,
              };
            }

            throw new ConflictException(
              'Ya existe un turno de caja abierto en esta sucursal. Debe cerrarlo antes de abrir uno nuevo.'
            );
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

    throw new BadRequestException('No se pudo abrir el turno debido a contención concurrente.');
  }

  /**
   * Register a manual cash movement (CASH_IN or CASH_OUT).
   * Verifies shift is open and that CASH_OUT does not result in negative expected cash.
   * Supports idempotent retries.
   */
  async registerMovement(
    type: 'CASH_IN' | 'CASH_OUT',
    command: CreateCashMovementCommand,
    session: SessionContext
  ): Promise<{
    success: boolean;
    movement: CashMovementResponse;
    shift: CashShiftResponse;
    idempotentReplay: boolean;
  }> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const { tenantId, locationId, userId } = session;
    const { amountCents, reason, idempotencyKey } = command;

    // Fast path: Check idempotency record before transaction
    const existingMovement = await this.prisma.cashMovement.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
      include: {
        createdByUser: { select: { id: true, name: true, email: true } },
        shift: {
          include: {
            openedByUser: { select: { id: true, name: true, email: true } },
            closedByUser: { select: { id: true, name: true, email: true } },
            movements: {
              orderBy: { createdAtUtc: 'asc' },
              include: {
                createdByUser: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (existingMovement) {
      if (existingMovement.locationId !== locationId) {
        throw new ConflictException(
          'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
        );
      }
      if (
        existingMovement.type !== type ||
        existingMovement.amountCents !== amountCents ||
        (existingMovement.reason || null) !== (reason || null)
      ) {
        throw new ConflictException(
          'La clave de idempotencia ya fue utilizada con una operación, motivo o monto diferente.'
        );
      }
      return {
        success: true,
        movement: this.mapMovementToResponse(existingMovement),
        shift: this.mapShiftToResponse(existingMovement.shift),
        idempotentReplay: true,
      };
    }

    const MAX_RETRIES = 10;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const activeShift = await tx.cashShift.findFirst({
              where: {
                tenantId,
                locationId,
                status: 'OPEN',
              },
            });

            if (!activeShift) {
              throw new BadRequestException(
                'No hay un turno de caja abierto en esta sucursal. Abra caja para registrar movimientos.'
              );
            }

            // In-tx idempotency check
            const inTxMovement = await tx.cashMovement.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId,
                  idempotencyKey,
                },
              },
              include: {
                createdByUser: { select: { id: true, name: true, email: true } },
                shift: {
                  include: {
                    openedByUser: { select: { id: true, name: true, email: true } },
                    closedByUser: { select: { id: true, name: true, email: true } },
                    movements: {
                      orderBy: { createdAtUtc: 'asc' },
                      include: {
                        createdByUser: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
              },
            });

            if (inTxMovement) {
              if (inTxMovement.locationId !== locationId) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
                );
              }
              if (
                inTxMovement.type !== type ||
                inTxMovement.amountCents !== amountCents ||
                (inTxMovement.reason || null) !== (reason || null)
              ) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada con una operación, motivo o monto diferente.'
                );
              }
              return {
                success: true,
                movement: this.mapMovementToResponse(inTxMovement),
                shift: this.mapShiftToResponse(inTxMovement.shift),
                idempotentReplay: true,
              };
            }

            // If CASH_OUT, compute current expected balance to prevent negative cash
            if (type === 'CASH_OUT') {
              const allMovements = await tx.cashMovement.findMany({
                where: { shiftId: activeShift.id },
              });

              const currentExpected =
                activeShift.openingAmountCents +
                allMovements
                  .filter((m) => m.type === 'SALE' || m.type === 'CASH_IN')
                  .reduce((sum, m) => sum + m.amountCents, 0) -
                allMovements
                  .filter((m) => m.type === 'CASH_OUT')
                  .reduce((sum, m) => sum + m.amountCents, 0);

              if (currentExpected - amountCents < 0) {
                throw new BadRequestException(
                  `Saldo insuficiente en caja para realizar el retiro. Saldo actual: $${(
                    currentExpected / 100
                  ).toFixed(2)}, retiro solicitado: $${(amountCents / 100).toFixed(2)}.`
                );
              }
            }

            const now = new Date();
            const signedAmountCents = type === 'CASH_IN' ? amountCents : -amountCents;

            // Touch activeShift to serialize with concurrent closes and other movements
            await tx.cashShift.update({
              where: { id: activeShift.id },
              data: { updatedAt: now },
            });

            const createdMovement = await tx.cashMovement.create({
              data: {
                tenantId,
                locationId,
                shiftId: activeShift.id,
                createdByUserId: userId,
                type,
                amountCents,
                signedAmountCents,
                reason,
                idempotencyKey,
                createdAtUtc: now,
              },
              include: {
                createdByUser: { select: { id: true, name: true, email: true } },
              },
            });

            // Fetch full shift with movements for updated response
            const fullShift = await tx.cashShift.findUniqueOrThrow({
              where: { id: activeShift.id },
              include: {
                openedByUser: { select: { id: true, name: true, email: true } },
                closedByUser: { select: { id: true, name: true, email: true } },
                movements: {
                  orderBy: { createdAtUtc: 'asc' },
                  include: {
                    createdByUser: { select: { id: true, name: true, email: true } },
                  },
                },
              },
            });

            return {
              success: true,
              movement: this.mapMovementToResponse(createdMovement),
              shift: this.mapShiftToResponse(fullShift),
              idempotentReplay: false,
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 10000,
          }
        );
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2002') {
            const replay = await this.prisma.cashMovement.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId,
                  idempotencyKey,
                },
              },
              include: {
                createdByUser: { select: { id: true, name: true, email: true } },
                shift: {
                  include: {
                    openedByUser: { select: { id: true, name: true, email: true } },
                    closedByUser: { select: { id: true, name: true, email: true } },
                    movements: {
                      orderBy: { createdAtUtc: 'asc' },
                      include: {
                        createdByUser: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
              },
            });

            if (replay) {
              if (replay.locationId !== locationId) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
                );
              }
              if (
                replay.type !== type ||
                replay.amountCents !== amountCents ||
                (replay.reason || null) !== (reason || null)
              ) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada con una operación, motivo o monto diferente.'
                );
              }
              return {
                success: true,
                movement: this.mapMovementToResponse(replay),
                shift: this.mapShiftToResponse(replay.shift),
                idempotentReplay: true,
              };
            }
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
      'No se pudo registrar el movimiento debido a contención concurrente.'
    );
  }

  /**
   * Close an open cash shift.
   * Computes expected cash from all persisted movements.
   * Records counted cash and difference.
   * Concurrency protected via version CAS and Serializable transaction.
   */
  async closeShift(
    command: CloseCashShiftCommand,
    session: SessionContext
  ): Promise<{ success: boolean; shift: CashShiftResponse; idempotentReplay: boolean }> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const { tenantId, locationId, userId } = session;
    const { countedAmountCents, idempotencyKey } = command;

    // Fast path: Check idempotency record before transaction
    const existingClosingMovement = await this.prisma.cashMovement.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId,
          idempotencyKey,
        },
      },
      include: {
        shift: {
          include: {
            openedByUser: { select: { id: true, name: true, email: true } },
            closedByUser: { select: { id: true, name: true, email: true } },
            movements: {
              orderBy: { createdAtUtc: 'asc' },
              include: {
                createdByUser: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    });

    if (existingClosingMovement) {
      if (existingClosingMovement.locationId !== locationId) {
        throw new ConflictException(
          'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
        );
      }
      if (
        existingClosingMovement.type !== 'CLOSING' ||
        existingClosingMovement.shift.countedAmountCents !== countedAmountCents
      ) {
        throw new ConflictException(
          'La clave de idempotencia ya fue utilizada con un conteo o cierre diferente.'
        );
      }
      return {
        success: true,
        shift: this.mapShiftToResponse(existingClosingMovement.shift),
        idempotentReplay: true,
      };
    }

    const MAX_RETRIES = 10;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const activeShift = await tx.cashShift.findFirst({
              where: {
                tenantId,
                locationId,
                status: 'OPEN',
              },
            });

            if (!activeShift) {
              throw new BadRequestException(
                'No hay un turno de caja abierto en esta sucursal para cerrar.'
              );
            }

            // In-tx idempotency check
            const inTxClosing = await tx.cashMovement.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId,
                  idempotencyKey,
                },
              },
              include: {
                shift: {
                  include: {
                    openedByUser: { select: { id: true, name: true, email: true } },
                    closedByUser: { select: { id: true, name: true, email: true } },
                    movements: {
                      orderBy: { createdAtUtc: 'asc' },
                      include: {
                        createdByUser: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
              },
            });

            if (inTxClosing) {
              if (inTxClosing.locationId !== locationId) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
                );
              }
              if (
                inTxClosing.type !== 'CLOSING' ||
                inTxClosing.shift.countedAmountCents !== countedAmountCents
              ) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada con un conteo o cierre diferente.'
                );
              }
              return {
                success: true,
                shift: this.mapShiftToResponse(inTxClosing.shift),
                idempotentReplay: true,
              };
            }

            // Compute ledger expected amount from all movements
            const movements = await tx.cashMovement.findMany({
              where: { shiftId: activeShift.id },
            });

            const cashSales = movements
              .filter((m) => m.type === 'SALE')
              .reduce((sum, m) => sum + m.amountCents, 0);

            const cashIn = movements
              .filter((m) => m.type === 'CASH_IN')
              .reduce((sum, m) => sum + m.amountCents, 0);

            const cashOut = movements
              .filter((m) => m.type === 'CASH_OUT')
              .reduce((sum, m) => sum + m.amountCents, 0);

            const expectedAmountCents =
              activeShift.openingAmountCents + cashSales + cashIn - cashOut;

            const differenceAmountCents = countedAmountCents - expectedAmountCents;
            const now = new Date();

            // CAS update with version
            const updateResult = await tx.cashShift.updateMany({
              where: {
                id: activeShift.id,
                version: activeShift.version,
                status: 'OPEN',
              },
              data: {
                status: 'CLOSED',
                closedByUserId: userId,
                closedAtUtc: now,
                expectedAmountCents,
                countedAmountCents,
                differenceAmountCents,
                version: { increment: 1 },
              },
            });

            if (updateResult.count === 0) {
              throw new Prisma.PrismaClientKnownRequestError(
                'Transaction failed due to a write conflict or a deadlock',
                {
                  code: 'P2034',
                  clientVersion: '5.x',
                }
              );
            }

            // Create CLOSING movement as permanent audit record
            await tx.cashMovement.create({
              data: {
                tenantId,
                locationId,
                shiftId: activeShift.id,
                createdByUserId: userId,
                type: 'CLOSING',
                amountCents: countedAmountCents,
                signedAmountCents: 0,
                reason: `Cierre de turno. Esperado: $${(expectedAmountCents / 100).toFixed(
                  2
                )}, Contado: $${(countedAmountCents / 100).toFixed(2)}, Diferencia: $${(
                  differenceAmountCents / 100
                ).toFixed(2)}`,
                idempotencyKey,
                createdAtUtc: now,
              },
              include: {
                createdByUser: { select: { id: true, name: true, email: true } },
              },
            });

            const closedShift = await tx.cashShift.findUniqueOrThrow({
              where: { id: activeShift.id },
              include: {
                openedByUser: { select: { id: true, name: true, email: true } },
                closedByUser: { select: { id: true, name: true, email: true } },
                movements: {
                  orderBy: { createdAtUtc: 'asc' },
                  include: {
                    createdByUser: { select: { id: true, name: true, email: true } },
                  },
                },
              },
            });

            return {
              success: true,
              shift: this.mapShiftToResponse(closedShift),
              idempotentReplay: false,
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            timeout: 10000,
          }
        );
      } catch (err: unknown) {
        if (err instanceof Prisma.PrismaClientKnownRequestError) {
          if (err.code === 'P2002') {
            const replay = await this.prisma.cashMovement.findUnique({
              where: {
                tenantId_idempotencyKey: {
                  tenantId,
                  idempotencyKey,
                },
              },
              include: {
                shift: {
                  include: {
                    openedByUser: { select: { id: true, name: true, email: true } },
                    closedByUser: { select: { id: true, name: true, email: true } },
                    movements: {
                      orderBy: { createdAtUtc: 'asc' },
                      include: {
                        createdByUser: { select: { id: true, name: true, email: true } },
                      },
                    },
                  },
                },
              },
            });

            if (replay) {
              if (replay.locationId !== locationId) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada en otra sucursal del comercio.'
                );
              }
              if (
                replay.type !== 'CLOSING' ||
                replay.shift.countedAmountCents !== countedAmountCents
              ) {
                throw new ConflictException(
                  'La clave de idempotencia ya fue utilizada con un conteo o cierre diferente.'
                );
              }
              return {
                success: true,
                shift: this.mapShiftToResponse(replay.shift),
                idempotentReplay: true,
              };
            }
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

    throw new BadRequestException('No se pudo cerrar el turno debido a contención concurrente.');
  }

  /**
   * List shifts for the location with pagination and date filters.
   * Accessible to OWNER and MANAGER.
   */
  async getShifts(
    session: SessionContext,
    query: QueryCashShifts
  ): Promise<PaginatedCashShiftsResponse> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const { page = 1, limit = 20, from, to, status } = query;
    const { fromUtc, toExclusiveUtc } = parseSalesDateRange(from, to);

    const where: Prisma.CashShiftWhereInput = {
      tenantId: session.tenantId,
      locationId: session.locationId,
    };

    if (status) {
      where.status = status;
    }

    if (fromUtc || toExclusiveUtc) {
      where.openedAtUtc = {
        ...(fromUtc ? { gte: fromUtc } : {}),
        ...(toExclusiveUtc ? { lt: toExclusiveUtc } : {}),
      };
    }

    const total = await this.prisma.cashShift.count({ where });

    const items = await this.prisma.cashShift.findMany({
      where,
      orderBy: [{ openedAtUtc: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: {
        openedByUser: { select: { id: true, name: true, email: true } },
        closedByUser: { select: { id: true, name: true, email: true } },
        movements: {
          orderBy: { createdAtUtc: 'asc' },
          include: {
            createdByUser: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: items.map((s) => this.mapShiftToResponse(s)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Get single shift detail by ID with isolation.
   * Accessible to OWNER, MANAGER, or CASHIER (for their active/own shift).
   */
  async getShiftById(session: SessionContext, id: string): Promise<CashShiftResponse> {
    if (!session?.tenantId || !session?.locationId) {
      throw new BadRequestException('Contexto de sesión con tenantId y locationId es obligatorio.');
    }

    const shift = await this.prisma.cashShift.findFirst({
      where: {
        id,
        tenantId: session.tenantId,
        locationId: session.locationId,
      },
      include: {
        openedByUser: { select: { id: true, name: true, email: true } },
        closedByUser: { select: { id: true, name: true, email: true } },
        movements: {
          orderBy: { createdAtUtc: 'asc' },
          include: {
            createdByUser: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Turno de caja no encontrado.');
    }

    // Cashier can only view the active shift or a shift they opened
    if (
      session.role === 'CASHIER' &&
      shift.status !== 'OPEN' &&
      shift.openedByUserId !== session.userId
    ) {
      throw new ForbiddenException('Permisos insuficientes para consultar este turno histórico.');
    }

    return this.mapShiftToResponse(shift);
  }

  /**
   * Helper to map a shift database record to a clean response with computed ledger summary.
   */
  private mapShiftToResponse(shift: CashShiftWithRelations): CashShiftResponse {
    const movements = shift.movements || [];

    const cashSalesAmountCents = movements
      .filter((m) => m.type === 'SALE')
      .reduce((sum, m) => sum + m.amountCents, 0);

    const cashInAmountCents = movements
      .filter((m) => m.type === 'CASH_IN')
      .reduce((sum, m) => sum + m.amountCents, 0);

    const cashOutAmountCents = movements
      .filter((m) => m.type === 'CASH_OUT')
      .reduce((sum, m) => sum + m.amountCents, 0);

    const expectedAmountCents =
      shift.openingAmountCents + cashSalesAmountCents + cashInAmountCents - cashOutAmountCents;

    const salesCount = movements.filter((m) => m.type === 'SALE').length;

    return {
      id: shift.id,
      tenantId: shift.tenantId,
      locationId: shift.locationId,
      openedByUserId: shift.openedByUserId,
      openedByUser: shift.openedByUser,
      closedByUserId: shift.closedByUserId,
      closedByUser: shift.closedByUser,
      status: shift.status,
      openingAmountCents: shift.openingAmountCents,
      expectedAmountCents:
        shift.status === 'CLOSED' ? shift.expectedAmountCents : expectedAmountCents,
      countedAmountCents: shift.countedAmountCents,
      differenceAmountCents: shift.differenceAmountCents,
      openedAtUtc: shift.openedAtUtc.toISOString(),
      closedAtUtc: shift.closedAtUtc ? shift.closedAtUtc.toISOString() : null,
      summary: {
        openingAmountCents: shift.openingAmountCents,
        cashSalesAmountCents,
        cashInAmountCents,
        cashOutAmountCents,
        expectedAmountCents,
        movementsCount: movements.length,
        salesCount,
      },
      movements: movements.map((m) => this.mapMovementToResponse(m)),
      createdAt: shift.createdAt.toISOString(),
      updatedAt: shift.updatedAt.toISOString(),
    };
  }

  private mapMovementToResponse(
    m: CashMovement & { createdByUser?: { id: string; name: string; email: string } }
  ): CashMovementResponse {
    return {
      id: m.id,
      tenantId: m.tenantId,
      locationId: m.locationId,
      shiftId: m.shiftId,
      createdByUserId: m.createdByUserId,
      createdByUser: m.createdByUser,
      type: m.type,
      amountCents: m.amountCents,
      signedAmountCents: m.signedAmountCents,
      reason: m.reason,
      saleId: m.saleId,
      idempotencyKey: m.idempotencyKey,
      createdAtUtc: m.createdAtUtc.toISOString(),
    };
  }
}
