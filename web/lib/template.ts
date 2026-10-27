// Mirrors server/src/services/templating.ts so the editor can preview emails live.

export const VARIABLES: { key: string; label: string }[] = [
  { key: 'business_name', label: 'Business name' },
  { key: 'ai_line', label: 'Personal line (AI)' },
  { key: 'category', label: 'Category (singular, e.g. dentist)' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'website_domain', label: 'Website' },
  { key: 'rating', label: 'Rating' },
  { key: 'review_count', label: 'Review count' },
  { key: 'sender_name', label: 'Your name' },
  { key: 'sender_company', label: 'Your company' },
];

export const SAMPLE_VARS: Record<string, string> = {
  business_name: 'Lakeshore Family Dental',
  ai_line:
    'I noticed Lakeshore Family Dental has more than 200 reviews averaging 4.7, which says a lot about how patients feel after a visit.',
  category: 'dentist',
  city: 'Mississauga',
  state: 'Ontario',
  country: 'Canada',
  website: 'https://lakeshorefamilydental.ca',
  website_domain: 'lakeshorefamilydental.ca',
  rating: '4.7',
  review_count: '213',
};

const VAR_RE = /\{\{\s*([a-zA-Z_]+)\s*(?:\|([^}]*))?\}\}/g;

export function renderTemplate(template: string, vars: Record<string, string | undefined>): string {
  return template
    .replace(VAR_RE, (_m, key: string, fallback?: string) => {
      const v = vars[key.toLowerCase()];
      return v && v.trim() ? v.trim() : (fallback ?? '').trim();
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
