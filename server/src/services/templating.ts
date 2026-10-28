import type { LeadAttrs } from '../models/Lead';

export const TEMPLATE_VARS = [
  'business_name',
  'category',
  'city',
  'state',
  'country',
  'website',
  'website_domain',
  'rating',
  'review_count',
  'ai_line',
  'sender_name',
  'sender_company',
] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];
export type TemplateVars = Partial<Record<TemplateVar, string>>;

const VAR_RE = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^}]*))?\}\}/g;

/** {{name}} or {{name|fallback}}. Unknown variables render empty. */
export function render(template: string, vars: TemplateVars): string {
  const out = template.replace(VAR_RE, (_m, key: string, fallback?: string) => {
    const value = vars[key.toLowerCase() as TemplateVar];
    return value && value.trim() ? value.trim() : (fallback ?? '').trim();
  });
  // An empty {{ai_line}} on its own line shouldn't leave a gap
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function unknownVars(template: string): string[] {
  const found = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) {
    const key = m[1].toLowerCase();
    if (!(TEMPLATE_VARS as readonly string[]).includes(key)) found.add(key);
  }
  return [...found];
}

function domainOf(url?: string | null): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

export function leadVars(
  lead: Partial<LeadAttrs>,
  extra: { aiLine?: string; senderName?: string; senderCompany?: string },
): TemplateVars {
  return {
    business_name: lead.name ?? undefined,
    category: lead.category?.toLowerCase() ?? undefined,
    city: lead.context?.city ?? undefined,
    state: lead.context?.state ?? undefined,
    country: lead.context?.country ?? undefined,
    website: lead.website ?? undefined,
    website_domain: domainOf(lead.website),
    rating: lead.rating != null ? lead.rating.toFixed(1) : undefined,
    review_count: lead.reviewCount != null ? String(lead.reviewCount) : undefined,
    ai_line: extra.aiLine,
    sender_name: extra.senderName,
    sender_company: extra.senderCompany,
  };
}

export const DEFAULT_STEPS = [
  {
    delayDays: 0,
    subject: 'Quick question for {{business_name}}',
    body: `Hi {{business_name}} team,

{{ai_line}}

I run {{sender_company}}. We help local businesses in {{city|your area}} win more customers online with better websites, online booking and local search.

Would a short call next week be useful? I can share two or three ideas specific to {{business_name}}, no strings attached.

Best,
{{sender_name}}`,
  },
  {
    delayDays: 4,
    subject: '',
    body: `Hi again,

Just bringing this back to the top of your inbox in case it got buried. Happy to send the ideas over by email instead of a call if that's easier.

{{sender_name}}`,
  },
];
