import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly database: PrismaService) {}

  @Get()
  check() {
    return this.live();
  }

  @Get('live')
  live() {
    return {
      status: 'ok',
      service: 'pulso-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  async ready() {
    try {
      await this.database.$queryRaw`SELECT 1 AS ready`;
      return {
        status: 'ready',
        service: 'pulso-api',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        service: 'pulso-api',
        reason: 'database_unavailable',
      });
    }
  }
}
