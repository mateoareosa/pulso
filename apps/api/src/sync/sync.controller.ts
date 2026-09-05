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
import { SyncBatchSchema } from '@pulso/contracts';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';

@Controller('sync')
@UseGuards(SessionAuthGuard)
export class SyncController {
  constructor(@Inject(SalesService) private readonly salesService: SalesService) {}

  @Post('batch')
  @HttpCode(200)
  async syncBatch(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parsed = SyncBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid sync batch schema',
        errors: parsed.error.errors,
      });
    }

    const results = [];
    for (const op of parsed.data.operations) {
      const res = await this.salesService.processSale(op.payload, {
        tenantId: session.tenantId,
        locationId: session.locationId,
      });
      results.push({
        operationId: op.operationId,
        status: 'SYNCED',
        idempotentReplay: res.idempotentReplay,
        saleId: res.sale.saleId,
        tenantId: res.sale.tenantId,
        locationId: res.sale.locationId,
      });
    }

    return {
      syncedCount: results.length,
      results,
    };
  }
}
