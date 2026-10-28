import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { adminEmails, env } from '../config/env';
import { User } from '../models/User';

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

// Account status is checked on every request so a suspension takes effect within seconds.
// A short cache keeps that from costing a database read per request.
interface CachedUser {
  status: string;
  email: string;
  at: number;
}
const userCache = new Map<string, CachedUser>();
const CACHE_MS = 15_000;
const lastSeenWrites = new Map<string, number>();
const SEEN_EVERY_MS = 60_000;

export function forgetUserCache(userId: string): void {
  userCache.delete(userId);
}

export function isPlatformAdmin(email?: string | null): boolean {
  return Boolean(email && adminEmails.has(email.toLowerCase()));
}

async function loadUser(userId: string): Promise<CachedUser | null> {
  const hit = userCache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  const user = await User.findById(userId, { status: 1, email: 1 }).lean();
  if (!user) {
    userCache.delete(userId);
    return null;
  }
  const entry = { status: user.status ?? 'active', email: user.email, at: Date.now() };
  userCache.set(userId, entry);
  return entry;
}

function touchLastSeen(userId: string): void {
  const last = lastSeenWrites.get(userId) ?? 0;
  if (Date.now() - last < SEEN_EVERY_MS) return;
  lastSeenWrites.set(userId, Date.now());
  User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined);
}

export const STATUS_MESSAGES: Record<string, string> = {
  pending: 'Your account is waiting for approval. You will get an email as soon as it is approved.',
  rejected: 'This account was not approved.',
  suspended: 'This account has been suspended. Contact support if you think this is a mistake.',
};

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  let payload: SessionPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as SessionPayload;
  } catch {
    clearSession(res);
    res.status(401).json({ error: 'Your session expired. Sign in again.' });
    return;
  }

  loadUser(payload.sub)
    .then((user) => {
      if (!user) {
        clearSession(res);
        res.status(401).json({ error: 'Sign in to continue.' });
        return;
      }
      if (user.status !== 'active' && !isPlatformAdmin(user.email)) {
        clearSession(res);
        res.status(401).json({ error: STATUS_MESSAGES[user.status] ?? 'Sign in to continue.' });
        return;
      }
      req.auth = { userId: payload.sub, workspaceId: payload.ws };
      touchLastSeen(payload.sub);
      next();
    })
    .catch(next);
}

/** Only platform admins (ADMIN_EMAILS) get through. Everyone else gets a plain 404. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  loadUser(req.auth!.userId)
    .then((user) => {
      if (!user || !isPlatformAdmin(user.email)) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      next();
    })
    .catch(next);
}
