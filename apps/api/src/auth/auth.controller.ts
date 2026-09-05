import { Controller, Post, Get, Body, Req, Res, HttpCode, UseGuards, Inject } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { SessionAuthGuard } from './auth.guard.js';
import { CurrentSession } from './current-session.decorator.js';
import {
  SESSION_COOKIE_NAME,
  setSessionCookie,
  clearSessionCookie,
  type SessionContext,
} from './cookie.utils.js';
import { RateLimiterService } from './rate-limiter.service.js';
import { normalizeEmail } from './security.utils.js';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(SessionService) private readonly sessionService: SessionService,
    @Inject(RateLimiterService) private readonly rateLimiter: RateLimiterService
  ) {}

  @Post('register')
  @HttpCode(201)
  async register(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response
  ) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    this.rateLimiter.checkLimit(`register:${ip}`, 5, 60_000);

    const { token, expiresAt, payload } = await this.authService.register(body);
    setSessionCookie(res, token, expiresAt);
    return payload;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: Request,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response
  ) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    this.rateLimiter.checkLimit(`login:ip:${ip}`, 5, 60_000);

    if (body && typeof body === 'object' && 'email' in body && typeof body.email === 'string') {
      const normalized = normalizeEmail(body.email);
      this.rateLimiter.checkLimit(`login:email:${normalized}`, 5, 60_000);
    }

    const { token, expiresAt, payload } = await this.authService.login(body);
    setSessionCookie(res, token, expiresAt);
    return payload;
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @HttpCode(200)
  async me(@CurrentSession() session: SessionContext) {
    return {
      user: session.user,
      tenant: session.tenant,
      location: session.location,
      role: session.role,
      expiresAt: session.expiresAt,
    };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (token) {
      await this.sessionService.revokeSession(token);
    }
    clearSessionCookie(res);
    return { success: true };
  }
}
