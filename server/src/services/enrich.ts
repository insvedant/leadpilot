import * as cheerio from 'cheerio';
import { isAllowedByRobots, safeFetch } from './safeFetch';

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}/gi;
const VALID_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;
// Asset filenames, placeholder domains and no-reply addresses aren't useful contacts
const JUNK_EMAIL =
  /(\.(png|jpe?g|gif|webp|svg|css|js|ico)$)|@(example|domain|email|sentry|sentry-next|wixpress|yourdomain|company)\.|^(no-?reply|donotreply|do-not-reply)@/i;

const SOCIAL_PATTERNS: Record<string, RegExp> = {
  facebook: /(^|\.)facebook\.com$/i,
  instagram: /(^|\.)instagram\.com$/i,
  linkedin: /(^|\.)linkedin\.com$/i,
  twitter: /(^|\.)(twitter|x)\.com$/i,
  youtube: /(^|\.)youtube\.com$/i,
  tiktok: /(^|\.)tiktok\.com$/i,
  whatsapp: /(^|\.)(wa\.me|whatsapp\.com)$/i,
};
const SHARE_PATH = /\/(sharer|share|intent|plugins|dialog)\b/i;
const CONTACT_HINT = /contact|about|team|reach|get-in-touch|impressum|kontakt|connect|location/i;

export type Socials = Partial<Record<keyof typeof SOCIAL_PATTERNS, string>>;

export interface EnrichResult {
  emails: string[];
  socials: Socials;
  pagesScanned: number;
}

/** Cloudflare's "email protection" hides addresses as XOR-encoded hex. */
function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, '');
}

function extract(html: string, pageUrl: string) {
  const $ = cheerio.load(html);
  const emails = new Set<string>();
  const socials: Socials = {};
  const candidates = new Set<string>();
  const pageHost = bareHost(new URL(pageUrl).hostname);

  const addEmail = (raw: string) => {
    const e = raw.trim().toLowerCase().replace(/^mailto:/, '').replace(/[.,;:)>\]]+$/, '');
    if (VALID_EMAIL.test(e) && !JUNK_EMAIL.test(e)) emails.add(e);
  };

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') ?? '';
    if (/^mailto:/i.test(href)) {
      try {
        decodeURIComponent(href.slice(7).split('?')[0]).split(',').forEach(addEmail);
      } catch {
        /* malformed mailto */
      }
      return;
    }
    if (href.includes('/cdn-cgi/l/email-protection#')) {
      addEmail(decodeCfEmail(href.split('#')[1] ?? ''));
      return;
    }
    let link: URL;
    try {
      link = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (link.protocol !== 'http:' && link.protocol !== 'https:') return;

    for (const [name, pattern] of Object.entries(SOCIAL_PATTERNS)) {
      if (pattern.test(link.hostname) && !SHARE_PATH.test(link.pathname) && link.pathname.length > 1) {
        socials[name as keyof Socials] ??= link.toString();
      }
    }

    const text = $(el).text();
    if (bareHost(link.hostname) === pageHost && (CONTACT_HINT.test(link.pathname) || CONTACT_HINT.test(text))) {
      link.hash = '';
      candidates.add(link.toString());
    }
  });

  $('[data-cfemail]').each((_, el) => addEmail(decodeCfEmail($(el).attr('data-cfemail') ?? '')));

  $('script, style, noscript').remove();
  for (const match of $('body').text().matchAll(EMAIL_RE)) addEmail(match[0]);

  return { emails, socials, candidates };
}

function normalizeWebsite(website: string): string {
  const withScheme = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  return new URL(withScheme).toString();
}

/** Scans a business's homepage plus up to 3 contact/about pages for public emails and social links. */
export async function enrichWebsite(website: string): Promise<EnrichResult> {
  const homepage = normalizeWebsite(website);
  const siteHost = bareHost(new URL(homepage).hostname);

  if (!(await isAllowedByRobots(homepage))) {
    throw new Error("This website's robots.txt asks crawlers not to visit");
  }

  const first = await safeFetch(homepage);
  if (!first) throw new Error("The website didn't respond or isn't a regular web page");

  const emails = new Set<string>();
  let socials: Socials = {};
  let pagesScanned = 1;

  const home = extract(first.body, first.url);
  home.emails.forEach((e) => emails.add(e));
  socials = { ...home.socials };

  for (const pageUrl of [...home.candidates].slice(0, 3)) {
    try {
      if (!(await isAllowedByRobots(pageUrl))) continue;
      const page = await safeFetch(pageUrl);
      if (!page) continue;
      pagesScanned++;
      const found = extract(page.body, page.url);
      found.emails.forEach((e) => emails.add(e));
      socials = { ...found.socials, ...socials };
    } catch {
      /* one failing subpage shouldn't fail the lead */
    }
  }

  // Addresses on the business's own domain first; they're the most likely to be real
  const ranked = [...emails].sort((a, b) => {
    const aOwn = bareHost(a.split('@')[1]).endsWith(siteHost) ? 0 : 1;
    const bOwn = bareHost(b.split('@')[1]).endsWith(siteHost) ? 0 : 1;
    return aOwn - bOwn;
  });

  return { emails: ranked.slice(0, 8), socials, pagesScanned };
}
