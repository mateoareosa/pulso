import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Inject,
  BadRequestException,
  Headers,
  HttpException,
} from '@nestjs/common';
import { PurchasesService } from './purchases.service.js';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  CreatePurchaseDraftCommandSchema,
  UpdatePurchaseDraftCommandSchema,
  ReceivePurchaseCommandSchema,
  CancelPurchaseCommandSchema,
  QueryPurchasesSchema,
} from '@pulso/contracts';

@Controller('purchases')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
export class PurchasesController {
  constructor(@Inject(PurchasesService) private readonly purchasesService: PurchasesService) {}

  @Get()
  async getPurchases(@Query() query: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = QueryPurchasesSchema.safeParse(query);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Parámetros de consulta de compras inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.purchasesService.getPurchases(parseResult.data, session);
  }

  @Post()
  @HttpCode(201)
  async createDraft(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = CreatePurchaseDraftCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos de la compra inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.purchasesService.createDraft(parseResult.data, session);
  }

  @Get(':id')
  async getPurchaseById(@Param('id') id: string, @CurrentSession() session: SessionContext) {
    return await this.purchasesService.getPurchaseById(id, session);
  }

  @Put(':id')
  async updateDraft(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSession() session: SessionContext,
    @Headers('if-match') ifMatch: string | string[] | undefined
  ) {
    const expectedVersion = this.parseExpectedVersion(ifMatch);
    const parseResult = UpdatePurchaseDraftCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos de la compra inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.purchasesService.updateDraft(id, parseResult.data, expectedVersion, session);
  }

  private parseExpectedVersion(ifMatch: string | string[] | undefined): number {
    if (ifMatch === undefined) {
      throw new HttpException('If-Match es obligatorio para modificar la compra.', 428);
    }

    if (typeof ifMatch !== 'string' || !/^(0|[1-9]\d*)$/.test(ifMatch)) {
      throw new BadRequestException('If-Match debe ser un entero no negativo canónico.');
    }

    const expectedVersion = Number(ifMatch);
    if (!Number.isSafeInteger(expectedVersion)) {
      throw new BadRequestException('If-Match excede el rango entero seguro.');
    }

    return expectedVersion;
  }

  @Post(':id/receive')
  @HttpCode(200)
  async receivePurchase(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSession() session: SessionContext
  ) {
    const parseResult = ReceivePurchaseCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos de recepción inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.purchasesService.receivePurchase(id, parseResult.data, session);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  async cancelPurchase(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSession() session: SessionContext
  ) {
    const parseResult = CancelPurchaseCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos de cancelación inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.purchasesService.cancelPurchase(id, parseResult.data, session);
  }
}
