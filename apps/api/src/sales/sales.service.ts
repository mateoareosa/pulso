import { Injectable, BadRequestException } from '@nestjs/common';
import { CreateSaleCommandSchema, type CreateSaleCommand } from '@pulso/contracts';

export interface SaleRecord {
  saleId: string;
  idempotencyKey: string;
  tenantId: string;
  locationId: string;
  totalCents: number;
  createdAt: string;
  status: 'COMPLETED';
}

@Injectable()
export class SalesService {
  // In-memory ledger storing processed operations by (tenantId:idempotencyKey)
  private readonly idempotencyLedger = new Map<string, SaleRecord>();
  private readonly sales = new Map<string, SaleRecord>();

  public async processSale(
    command: unknown,
    sessionContext: { tenantId: string; locationId: string }
  ): Promise<{
    success: boolean;
    sale: SaleRecord;
    idempotentReplay: boolean;
  }> {
    if (!sessionContext || !sessionContext.tenantId || !sessionContext.locationId) {
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

    // Derive tenantId and locationId strictly from verified session
    const tenantId = sessionContext.tenantId;
    const locationId = sessionContext.locationId;

    const ledgerKey = `${tenantId}:${validCommand.idempotencyKey}`;

    // Check for idempotency replay
    const existing = this.idempotencyLedger.get(ledgerKey);
    if (existing) {
      return {
        success: true,
        sale: existing,
        idempotentReplay: true,
      };
    }

    // New sale processing
    const saleId = `SALE-${validCommand.idempotencyKey.slice(0, 8).toUpperCase()}`;
    const record: SaleRecord = {
      saleId,
      idempotencyKey: validCommand.idempotencyKey,
      tenantId,
      locationId,
      totalCents: validCommand.totalCents,
      createdAt: new Date().toISOString(),
      status: 'COMPLETED',
    };

    this.idempotencyLedger.set(ledgerKey, record);
    this.sales.set(saleId, record);

    return {
      success: true,
      sale: record,
      idempotentReplay: false,
    };
  }

  public getSaleById(saleId: string, tenantId?: string): SaleRecord | undefined {
    const sale = this.sales.get(saleId);
    if (sale && tenantId && sale.tenantId !== tenantId) {
      return undefined;
    }
    return sale;
  }

  public clear(): void {
    this.idempotencyLedger.clear();
    this.sales.clear();
  }
}
