import { Module } from '@nestjs/common';
import { TestResetController } from './test-reset.controller.js';

@Module({
  controllers: [TestResetController],
})
export class TestResetModule {}
