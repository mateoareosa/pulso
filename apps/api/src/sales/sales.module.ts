import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';
import { SalesAdjustmentService } from './sales-adjustment.service.js';

@Module({
  controllers: [SalesController],
  providers: [SalesService, SalesAdjustmentService],
  exports: [SalesService],
})
export class SalesModule {}
