import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { Request } from 'express';
import { SESSION_COOKIE_NAME } from './cookie.utils.js';

export interface OriginValidationOptions {
  isProduction?: boolean;
  allowedOrigins?: string[];
}

export const ORIGIN_VALIDATION_OPTIONS = 'ORIGIN_VALIDATION_OPTIONS';

const DEV_TEST_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:4100',
  'http://localhost:4173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:4100',
  'http://127.0.0.1:4173',
];

@Injectable()
export class OriginValidationGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;
  private readonly isProduction: boolean;

  constructor(
    @Optional()
    @Inject(ORIGIN_VALIDATION_OPTIONS)
    options?: OriginValidationOptions
  ) {
    this.isProduction =
      options?.isProduction !== undefined
        ? options.isProduction
        : process.env.NODE_ENV === 'production';

    const customOrigins = options?.allowedOrigins;

    const envOrigins =
      customOrigins !== undefined
        ? customOrigins
        : process.env.ALLOWED_ORIGINS
          ? process.env.ALLOWED_ORIGINS.split(',')
              .map((o) => o.trim())
              .filter(Boolean)
          : [];

    if (this.isProduction) {
      if (envOrigins.length === 0) {
        throw new Error('ALLOWED_ORIGINS environment variable is mandatory in production.');
      }
      // In production, NEVER automatically permit localhost
      this.allowedOrigins = new Set(envOrigins);
    } else {
      // In development / testing, allow localhost and any explicitly declared origins
      this.allowedOrigins = new Set([...DEV_TEST_ALLOWED_ORIGINS, ...envOrigins]);
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Only state-mutating methods require origin validation
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return true;
    }

    const rawOrigin = request.headers.origin;
    const rawReferer = request.headers.referer;

    // 1. Explicit Origin header has priority
    if (rawOrigin) {
      if (!this.allowedOrigins.has(rawOrigin)) {
        throw new ForbiddenException(`Origen no permitido: ${rawOrigin}`);
      }
      return true;
    }

    // 2. Fallback to Referer header if Origin is not present
    if (rawReferer) {
      try {
        const parsedRefererOrigin = new URL(rawReferer).origin;
        if (!this.allowedOrigins.has(parsedRefererOrigin)) {
          throw new ForbiddenException(`Referer no permitido: ${parsedRefererOrigin}`);
        }
        return true;
      } catch {
        throw new ForbiddenException('Cabecera Referer inválida');
      }
    }

    // 3. Neither Origin nor Referer provided:
    const hasSessionCookie = Boolean(request.cookies?.[SESSION_COOKIE_NAME]);

    if (this.isProduction && hasSessionCookie) {
      // In production, authenticated browser mutations MUST provide Origin or Referer to mitigate CSRF
      throw new ForbiddenException(
        'Mutación autenticada requiere cabecera Origin o Referer permitida en producción'
      );
    }

    // In development / testing (or unauthenticated endpoints), allow absence for CLI / local tooling
    return true;
  }
}
