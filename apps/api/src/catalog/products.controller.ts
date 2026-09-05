import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  createProductSchema,
  updateProductSchema,
  updateLocationSettingsSchema,
  createStockAdjustmentSchema,
  productSearchQuerySchema,
} from '@pulso/contracts';

@Controller('products')
@UseGuards(SessionAuthGuard)
export class ProductsController {
  constructor(@Inject(ProductsService) private readonly productsService: ProductsService) {}

  @Get()
  async searchProducts(@Query() query: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = productSearchQuerySchema.safeParse(query);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Parámetros de búsqueda inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.productsService.searchProducts(session, parseResult.data);
  }

  @Get('quick-slots')
  async getQuickSlots(@CurrentSession() session: SessionContext) {
    return await this.productsService.getQuickSlots(session);
  }

  @Get(':id')
  async getProductById(@Param('id') id: string, @CurrentSession() session: SessionContext) {
    return await this.productsService.getProductById(session, id);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async createProduct(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = createProductSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Contrato de creación de producto inválido',
        errors: parseResult.error.errors,
      });
    }

    return await this.productsService.createProduct(session, parseResult.data);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async updateProduct(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSession() session: SessionContext
  ) {
    const parseResult = updateProductSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Contrato de actualización de producto inválido',
        errors: parseResult.error.errors,
      });
    }

    return await this.productsService.updateProduct(session, id, parseResult.data);
  }

  @Patch(':id/location-settings')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async updateLocationSettings(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSession() session: SessionContext
  ) {
    const parseResult = updateLocationSettingsSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Contrato de configuración de sucursal inválido',
        errors: parseResult.error.errors,
      });
    }

    return await this.productsService.updateLocationSettings(session, id, parseResult.data);
  }

  @Post(':id/stock-adjustments')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async adjustStock(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSession() session: SessionContext
  ) {
    const parseResult = createStockAdjustmentSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Contrato de ajuste de inventario inválido',
        errors: parseResult.error.errors,
      });
    }

    return await this.productsService.adjustStock(session, id, parseResult.data);
  }

  @Get(':id/stock-movements')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async listStockMovements(@Param('id') id: string, @CurrentSession() session: SessionContext) {
    return await this.productsService.listStockMovements(session, id);
  }
}
