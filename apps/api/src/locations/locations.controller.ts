import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { LocationsService } from './locations.service.js';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import { CreateLocationInputSchema, LocationResponse } from '@pulso/contracts';

@Controller('locations')
@UseGuards(SessionAuthGuard)
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locationsService: LocationsService) {}

  @Get()
  @HttpCode(200)
  async getLocations(@CurrentSession() session: SessionContext): Promise<LocationResponse[]> {
    // Derive tenant strictly from verified session
    return await this.locationsService.findByTenant(session.tenantId);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @HttpCode(201)
  async createLocation(
    @CurrentSession() session: SessionContext,
    @Body() body: unknown
  ): Promise<LocationResponse> {
    const parseResult = CreateLocationInputSchema.safeParse(body);
    if (!parseResult.success) {
      throw new BadRequestException({
        message: 'Datos de sucursal inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.locationsService.createLocationForTenant(session.tenantId, {
      name: parseResult.data.name,
      address: parseResult.data.address,
    });
  }
}
