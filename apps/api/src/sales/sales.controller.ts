import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { SalesService } from './sales.service.js';
import { SalesAdjustmentService } from './sales-adjustment.service.js';
import { QuerySalesSchema } from '@pulso/contracts';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';

@Controller('sales')
@UseGuards(SessionAuthGuard)
export class SalesController {
  constructor(
    @Inject(SalesService) private readonly salesService: SalesService,
    @Inject(SalesAdjustmentService) private readonly adjustments: SalesAdjustmentService
  ) {}

  @Post()
  @HttpCode(200)
  async createSale(@Body() payload: unknown, @CurrentSession() session: SessionContext) {
    return await this.salesService.processSale(payload, session);
  }

  @Post(':id/returns')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async returnSale(@Param('id') id: string, @Body() payload: unknown, @CurrentSession() session: SessionContext) {
    return this.adjustments.returnSale(id, payload, session);
  }

  @Post(':id/void')
  @HttpCode(200)
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async voidSale(@Param('id') id: string, @Body() payload: unknown, @CurrentSession() session: SessionContext) {
    return this.adjustments.voidSale(id, payload, session);
  }

  @Get()
  async getSales(@Query() query: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = QuerySalesSchema.safeParse(query);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Parámetros de consulta de ventas inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.salesService.getSales(session, parseResult.data);
  }

  @Get(':id')
  async getSaleById(@Param('id') id: string, @CurrentSession() session: SessionContext) {
    return await this.salesService.getSaleById(session, id);
  }
}
