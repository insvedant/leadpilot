import { env } from '../config/env';

export type VerifyResult = 'ok' | 'catch_all' | 'unknown' | 'invalid' | 'disposable' | 'error';

export const verificationAvailable = () => Boolean(env.MILLIONVERIFIER_API_KEY);

/** MillionVerifier single-email check. */
export async function verifyEmail(email: string): Promise<VerifyResult> {
  if (!env.MILLIONVERIFIER_API_KEY) throw new Error('MILLIONVERIFIER_API_KEY is not set');
  const url = new URL('https://api.millionverifier.com/api/v3/');
  url.searchParams.set('api', env.MILLIONVERIFIER_API_KEY);
  url.searchParams.set('email', email);
  url.searchParams.set('timeout', '20');
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) return 'error';
  const data = (await res.json().catch(() => null)) as { result?: string; error?: string } | null;
  const result = data?.result;
  if (result === 'ok' || result === 'catch_all' || result === 'unknown' || result === 'invalid' || result === 'disposable') {
    return result;
  }
  return 'error';
}

export const SENDABLE: VerifyResult[] = ['ok', 'catch_all'];
export const BLOCKED: VerifyResult[] = ['invalid', 'disposable'];
