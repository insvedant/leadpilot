import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const SESSION_COOKIE = 'lp_session';

interface SessionPayload {
  sub: string;
  ws: string;
}

export function signSession(res: Response, userId: string, workspaceId: string): void {
  const token = jwt.sign({ sub: userId, ws: workspaceId } satisfies SessionPayload, env.JWT_SECRET, {
    expiresIn: '7d',
  });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as SessionPayload;
    req.auth = { userId: payload.sub, workspaceId: payload.ws };
    next();
  } catch {
    clearSession(res);
    res.status(401).json({ error: 'Your session expired. Sign in again.' });
  }
}
