import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  UseGuards,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { CashService } from './cash.service.js';
import { SessionAuthGuard } from '../auth/auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import type { SessionContext } from '../auth/cookie.utils.js';
import {
  OpenCashShiftCommandSchema,
  CloseCashShiftCommandSchema,
  CreateCashMovementCommandSchema,
  QueryCashShiftsSchema,
} from '@pulso/contracts';

@Controller('cash')
@UseGuards(SessionAuthGuard)
export class CashController {
  constructor(@Inject(CashService) private readonly cashService: CashService) {}

  @Get('active')
  async getActiveShift(@CurrentSession() session: SessionContext) {
    return await this.cashService.getActiveShift(session);
  }

  @Post('shifts/open')
  @HttpCode(200)
  async openShift(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = OpenCashShiftCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos de apertura de caja inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.cashService.openShift(parseResult.data, session);
  }

  @Post('movements/in')
  @HttpCode(200)
  async registerCashIn(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = CreateCashMovementCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos de ingreso de efectivo inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.cashService.registerMovement('CASH_IN', parseResult.data, session);
  }

  @Post('movements/out')
  @HttpCode(200)
  async registerCashOut(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = CreateCashMovementCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos de retiro de efectivo inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.cashService.registerMovement('CASH_OUT', parseResult.data, session);
  }

  @Post('shifts/close')
  @HttpCode(200)
  async closeShift(@Body() body: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = CloseCashShiftCommandSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Datos de cierre de caja inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.cashService.closeShift(parseResult.data, session);
  }

  @Get('shifts')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'MANAGER')
  async getShifts(@Query() query: unknown, @CurrentSession() session: SessionContext) {
    const parseResult = QueryCashShiftsSchema.safeParse(query);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message;
      throw new BadRequestException({
        message: firstError || 'Parámetros de consulta de turnos inválidos',
        errors: parseResult.error.errors,
      });
    }

    return await this.cashService.getShifts(session, parseResult.data);
  }

  @Get('shifts/:id')
  async getShiftById(@Param('id') id: string, @CurrentSession() session: SessionContext) {
    return await this.cashService.getShiftById(session, id);
  }
}
