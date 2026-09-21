import { Module } from '@nestjs/common';
import { EmployeeAuditService } from './audit.service.js';
import { EmployeesController } from './employees.controller.js';
import { EmployeesService } from './employees.service.js';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeAuditService],
})
export class EmployeesModule {}
