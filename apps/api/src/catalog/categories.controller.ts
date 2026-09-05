import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { CategoriesService } from './categories.service.js';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import { createCategorySchema, updateCategorySchema } from '@pulso/contracts';

@Controller('categories')
@UseGuards(SessionAuthGuard)
export class CategoriesController {
  constructor(@Inject(CategoriesService) private readonly categoriesService: CategoriesService) {}

  @Get()
  async listCategories(@CurrentSession() session: SessionContext) {
    return await this.categoriesService.listCategories(session.tenantId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async createCategory(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = createCategorySchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Contrato de categoría inválido',
        errors: parseResult.error.errors,
      });
    }

    return await this.categoriesService.createCategory(session.tenantId, parseResult.data);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentSession() session: SessionContext
  ) {
    const parseResult = updateCategorySchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Contrato de actualización de categoría inválido',
        errors: parseResult.error.errors,
      });
    }

    return await this.categoriesService.updateCategory(session.tenantId, id, parseResult.data);
  }
}
