import {
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
  UseGuards,
  Inject,
} from '@nestjs/common';
import { SalesService } from '../sales/sales.service.js';
import { SyncBatchSchema, type SyncBatchResponse, type SyncBatchResult } from '@pulso/contracts';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';

@Controller('sync')
@UseGuards(SessionAuthGuard)
export class SyncController {
  constructor(@Inject(SalesService) private readonly salesService: SalesService) {}

  @Post('batch')
  @HttpCode(200)
  async syncBatch(
    @Body() body: unknown,
    @CurrentSession() session: SessionContext
  ): Promise<SyncBatchResponse> {
    const parsed = SyncBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid sync batch schema',
        errors: parsed.error.errors,
      });
    }

    const results: SyncBatchResult[] = [];
    let syncedCount = 0;

    for (const op of parsed.data.operations) {
      try {
        const res = await this.salesService.processSale(op.payload, session);
        syncedCount++;
        results.push({
          operationId: op.operationId,
          status: 'SYNCED',
          idempotentReplay: res.idempotentReplay,
          saleId: res.sale.id,
          tenantId: res.sale.tenantId,
          locationId: res.sale.locationId,
          warnings: res.warnings,
        });
      } catch (err: unknown) {
        let errorMsg = 'Error operacional al procesar venta';
        if (err instanceof BadRequestException) {
          const resp = err.getResponse();
          if (typeof resp === 'string') {
            errorMsg = resp;
          } else if (typeof resp === 'object' && resp !== null) {
            const m = (resp as Record<string, unknown>).message;
            errorMsg = Array.isArray(m) ? m.join(', ') : String(m || err.message);
          }
        } else if (err instanceof Error) {
          errorMsg = err.message;
        }

        results.push({
          operationId: op.operationId,
          status: 'FAILED',
          error: errorMsg,
          tenantId: session.tenantId,
          locationId: session.locationId,
        });
      }
    }

    return {
      syncedCount,
      results,
    };
  }
}
