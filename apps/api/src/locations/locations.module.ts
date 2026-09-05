import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { LocationsService } from './locations.service.js';
import { LocationsController } from './locations.controller.js';
import { RolesGuard } from '../auth/roles.guard.js';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService, RolesGuard, Reflector],
  exports: [LocationsService],
})
export class LocationsModule {}
