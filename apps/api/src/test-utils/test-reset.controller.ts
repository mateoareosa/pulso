import { Controller, Post, HttpCode, ForbiddenException, Inject, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RateLimiterService } from '../auth/rate-limiter.service.js';

@Controller('test')
export class TestResetController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RateLimiterService) private readonly rateLimiter?: RateLimiterService
  ) {}

  @Post('reset')
  @HttpCode(200)
  async reset() {
    if (process.env.NODE_ENV !== 'test') {
      throw new ForbiddenException('Test reset is only permitted in test environments');
    }

    await this.prisma.cleanDatabaseForTesting();
    this.rateLimiter?.reset();
    return { success: true, message: 'Database reset successfully' };
  }
}
