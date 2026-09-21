import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  CreateSupplierCommandSchema,
  UpdateSupplierCommandSchema,
  QuerySuppliersSchema,
} from '@pulso/contracts';

@Controller('suppliers')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
export class SuppliersController {
  constructor(@Inject(SuppliersService) private readonly suppliersService: SuppliersService) {}

  @Get()
  async getSuppliers(@Query() query: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = QuerySuppliersSchema.safeParse(query);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Parámetros de consulta de proveedores inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.suppliersService.getSuppliers(parseResult.data, session);
  }

  @Post()
  @HttpCode(201)
  async createSupplier(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = CreateSupplierCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos del proveedor inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.suppliersService.createSupplier(parseResult.data, session);
  }

  @Get(':id')
  async getSupplierById(@Param('id') id: string, @CurrentSession() session: SessionContext) {
    return await this.suppliersService.getSupplierById(id, session);
  }

  @Put(':id')
  async updateSupplier(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSession() session: SessionContext
  ) {
    const parseResult = UpdateSupplierCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos del proveedor inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.suppliersService.updateSupplier(id, parseResult.data, session);
  }

  @Patch(':id/status')
  async toggleSupplierStatus(
    @Param('id') id: string,
    @Body() body: { isActive?: boolean },
    @CurrentSession() session: SessionContext
  ) {
    if (typeof body?.isActive !== 'boolean') {
      throw new BadRequestException('El campo isActive debe ser un booleano');
    }

    return await this.suppliersService.updateSupplier(id, { isActive: body.isActive }, session);
  }
}
