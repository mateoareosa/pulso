import { Response } from 'express';
import { MembershipRole } from '@pulso/contracts';

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'pulso_session';

export interface SessionContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  locationId: string;
  membershipId: string;
  role: MembershipRole;
  user: {
    id: string;
    email: string;
    name: string;
  };
  tenant: {
    id: string;
    name: string;
    slug: string;
  };
  location: {
    id: string;
    name: string;
  };
  expiresAt: string;
}

export function isCookieSecure(
  nodeEnv: string | undefined = process.env.NODE_ENV,
  cookieSecureEnv: string | undefined = process.env.COOKIE_SECURE
): boolean {
  // In production, Secure cookies are mandatory and INVIOLABLE.
  // An environment variable can never disable Secure cookies in production.
  if (nodeEnv === 'production') {
    return true;
  }
  if (cookieSecureEnv !== undefined) {
    return cookieSecureEnv === 'true';
  }
  return false;
}

export function setSessionCookie(res: Response, token: string, expiresAt: Date): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure(),
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isCookieSecure(),
    path: '/',
  });
}
