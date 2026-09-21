import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CreateEmployeeInvitationInputSchema,
  EmployeeMutationInputSchema,
  EmployeeVersionInputSchema,
} from '@pulso/contracts';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import { Roles } from '../auth/roles.decorator.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { EmployeeAuditService } from './audit.service.js';
import { EmployeesService } from './employees.service.js';

@Controller('employees')
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles('OWNER')
export class EmployeesController {
  constructor(
    @Inject(EmployeesService) private readonly employees: EmployeesService,
    @Inject(EmployeeAuditService) private readonly audit: EmployeeAuditService
  ) {}

  @Get()
  async list(@CurrentSession() session: SessionContext) {
    return await this.employees.list(session.tenantId);
  }

  @Get('audit')
  async listAudit(@CurrentSession() session: SessionContext) {
    return await this.audit.list(session.tenantId);
  }

  @Post('invitations')
  @HttpCode(201)
  async invite(@CurrentSession() session: SessionContext, @Body() body: unknown) {
    const input = this.parse(
      CreateEmployeeInvitationInputSchema,
      body,
      'Datos de invitación inválidos'
    );
    return await this.employees.invite(session.tenantId, session.userId, input);
  }

  @Post('invitations/:membershipId/resend')
  @HttpCode(201)
  async resend(
    @CurrentSession() session: SessionContext,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown
  ) {
    const input = this.parse(EmployeeVersionInputSchema, body, 'Versión de invitación inválida');
    return await this.employees.resendInvitation(
      session.tenantId,
      session.userId,
      membershipId,
      input.version
    );
  }

  @Post('invitations/:membershipId/cancel')
  @HttpCode(200)
  async cancel(
    @CurrentSession() session: SessionContext,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown
  ) {
    const input = this.parse(EmployeeVersionInputSchema, body, 'Versión de invitación inválida');
    return await this.employees.cancelInvitation(
      session.tenantId,
      session.userId,
      membershipId,
      input.version
    );
  }

  @Patch(':membershipId')
  async update(
    @CurrentSession() session: SessionContext,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown
  ) {
    const input = this.parse(EmployeeMutationInputSchema, body, 'Datos de empleado inválidos');
    return await this.employees.update(session.tenantId, session.userId, membershipId, input);
  }

  @Post(':membershipId/password-reset')
  @HttpCode(201)
  async passwordReset(
    @CurrentSession() session: SessionContext,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown
  ) {
    const input = this.parse(EmployeeVersionInputSchema, body, 'Versión de empleado inválida');
    return await this.employees.issuePasswordReset(
      session.tenantId,
      session.userId,
      membershipId,
      input.version
    );
  }

  @Post(':membershipId/revoke-sessions')
  @HttpCode(200)
  async revokeSessions(
    @CurrentSession() session: SessionContext,
    @Param('membershipId') membershipId: string,
    @Body() body: unknown
  ) {
    const input = this.parse(EmployeeVersionInputSchema, body, 'Versión de empleado inválida');
    return await this.employees.revokeSessions(
      session.tenantId,
      session.userId,
      membershipId,
      input.version
    );
  }

  private parse<T>(
    schema: {
      safeParse(
        value: unknown
      ): { success: true; data: T } | { success: false; error: { errors: unknown[] } };
    },
    body: unknown,
    message: string
  ): T {
    const result = schema.safeParse(body);
    if (!result.success) throw new BadRequestException({ message, errors: result.error.errors });
    return result.data;
  }
}
