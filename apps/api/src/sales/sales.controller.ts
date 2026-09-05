import { Controller, Post, Body, HttpCode, UseGuards, Inject } from '@nestjs/common';
import { SalesService } from './sales.service.js';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';

@Controller('sales')
@UseGuards(SessionAuthGuard)
export class SalesController {
  constructor(@Inject(SalesService) private readonly salesService: SalesService) {}

  @Post()
  @HttpCode(200)
  async createSale(@Body() payload: unknown, @CurrentSession() session: SessionContext) {
    return await this.salesService.processSale(payload, {
      tenantId: session.tenantId,
      locationId: session.locationId,
    });
  }
}
