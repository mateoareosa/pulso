import { Controller, Post, Body, HttpCode, BadRequestException } from '@nestjs/common';
import { SalesService } from '../sales/sales.service.js';
import { z } from 'zod';
import { CreateSaleCommandSchema } from '@pulso/contracts';

const SyncBatchSchema = z.object({
  deviceId: z.string().min(1),
  operations: z.array(
    z.object({
      operationId: z.string().uuid(),
      type: z.literal('CREATE_SALE'),
      payload: CreateSaleCommandSchema,
    })
  ),
});

@Controller('sync')
export class SyncController {
  constructor(private readonly salesService: SalesService) {}

  @Post('batch')
  @HttpCode(200)
  async syncBatch(@Body() body: unknown) {
    const parsed = SyncBatchSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid sync batch schema',
        errors: parsed.error.errors,
      });
    }

    const results = [];
    for (const op of parsed.data.operations) {
      const res = await this.salesService.processSale(op.payload);
      results.push({
        operationId: op.operationId,
        status: 'SYNCED',
        idempotentReplay: res.idempotentReplay,
        saleId: res.sale.saleId,
      });
    }

    return {
      syncedCount: results.length,
      results,
    };
  }
}
