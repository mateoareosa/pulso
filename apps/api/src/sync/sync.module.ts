import { Module } from '@nestjs/common';
import { SyncController } from './sync.controller.js';
import { SalesModule } from '../sales/sales.module.js';

@Module({
  imports: [SalesModule],
  controllers: [SyncController],
})
export class SyncModule {}
