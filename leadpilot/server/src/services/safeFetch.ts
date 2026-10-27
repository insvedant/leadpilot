import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export const BOT_USER_AGENT = 'LeadPilotBot/1.0 (+contact finder; respects robots.txt)';

/**
 * SSRF guard. Business websites come from third-party data, so before we fetch
 * anything we make sure it resolves to a public address. Without this, a
 * listing pointing at http://169.254.169.254 or localhost could probe your server.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  if (ipaddr.isValid(hostname)) return assertPublicIp(hostname);
  const addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addrs.length) throw new Error('Domain does not resolve');
  for (const a of addrs) assertPublicIp(a.address);
}

function assertPublicIp(address: string): void {
  let ip = ipaddr.parse(address);
  if (ip.kind() === 'ipv6' && (ip as ipaddr.IPv6).isIPv4MappedAddress()) {
    ip = (ip as ipaddr.IPv6).toIPv4Address();
  }
  if (ip.range() !== 'unicast') throw new Error('Website points to a private network address');
}

export interface FetchedPage {
  url: string;
  body: string;
  contentType: string;
}

export async function safeFetch(
  rawUrl: string,
  opts: { timeoutMs?: number; maxBytes?: number; accept?: 'html' | 'text' } = {},
): Promise<FetchedPage | null> {
  const { timeoutMs = 8000, maxBytes = 1_500_000, accept = 'html' } = opts;
  let current = rawUrl;

  for (let hop = 0; hop < 5; hop++) {
    const url = new URL(current);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.port && !['80', '443', '8080'].includes(url.port)) return null;
    await assertPublicHost(url.hostname);

    const res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': BOT_USER_AGENT,
        Accept: accept === 'html' ? 'text/html,application/xhtml+xml' : 'text/plain',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return null;
      current = new URL(location, url).toString();
      continue;
    }
    if (!res.ok || !res.body) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (accept === 'html' && !/html|xml/i.test(contentType)) return null;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { url: url.toString(), body: Buffer.concat(chunks).toString('utf8'), contentType };
  }
  return null;
}

// --- robots.txt -----------------------------------------------------------

const robotsCache = new Map<string, { rules: RegExp[]; at: number }>();
const ROBOTS_TTL = 1000 * 60 * 60 * 6;

function ruleToRegex(rule: string): RegExp {
  const anchored = rule.endsWith('$');
  const body = (anchored ? rule.slice(0, -1) : rule)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

function parseRobots(txt: string): RegExp[] {
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[] } | null = null;
  let lastWasAgent = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (key === 'disallow' && current && value) current.disallow.push(value);
    }
  }

  const ours = groups.filter((g) => g.agents.some((a) => a.includes('leadpilotbot')));
  const chosen = ours.length ? ours : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.disallow).map(ruleToRegex);
}

export async function isAllowedByRobots(pageUrl: string): Promise<boolean> {
  const url = new URL(pageUrl);
  const origin = url.origin;
  let entry = robotsCache.get(origin);
  if (!entry || Date.now() - entry.at > ROBOTS_TTL) {
    let rules: RegExp[] = [];
    try {
      const page = await safeFetch(`${origin}/robots.txt`, { accept: 'text', maxBytes: 200_000, timeoutMs: 5000 });
      if (page && !/html/i.test(page.contentType)) rules = parseRobots(page.body);
    } catch {
      rules = [];
    }
    entry = { rules, at: Date.now() };
    robotsCache.set(origin, entry);
  }
  const path = url.pathname + url.search;
  return !entry.rules.some((r) => r.test(path));
}
