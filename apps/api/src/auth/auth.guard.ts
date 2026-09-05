import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import { SessionService } from './session.service.js';
import { SESSION_COOKIE_NAME, SessionContext } from './cookie.utils.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      sessionContext?: SessionContext;
    }
  }
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(@Inject(SessionService) private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = req.cookies?.[SESSION_COOKIE_NAME];

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('No autenticado');
    }

    const sessionContext = await this.sessionService.validateSession(token);
    req.sessionContext = sessionContext;

    return true;
  }
}
