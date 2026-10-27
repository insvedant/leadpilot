import 'dotenv/config';
import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be 64 hex characters (generate with: openssl rand -hex 32)'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  PUBLIC_APP_URL: optional,
  GOOGLE_PLACES_API_KEY: z.string().min(1, 'GOOGLE_PLACES_API_KEY is required'),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default('claude-haiku-5-5'),
  MILLIONVERIFIER_API_KEY: optional,
  SYSTEM_SMTP_URL: optional,
  SYSTEM_FROM: optional,
  ADMIN_EMAILS: z.string().default(''),
  FREE_PLAN_SEARCHES_PER_MONTH: z.coerce.number().default(50),
  FREE_PLAN_ENRICHMENTS_PER_MONTH: z.coerce.number().default(500),
  FREE_PLAN_EMAILS_PER_MONTH: z.coerce.number().default(300),
  FREE_PLAN_AI_PER_MONTH: z.coerce.number().default(300),
  FREE_PLAN_VERIFICATIONS_PER_MONTH: z.coerce.number().default(300),
  ENRICH_CONCURRENCY: z.coerce.number().min(1).max(16).default(4),
  SCHEDULER_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DNS_SERVERS: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  PUBLIC_APP_URL: (parsed.data.PUBLIC_APP_URL ?? parsed.data.WEB_ORIGIN).replace(/\/$/, ''),
};
export const adminEmails = new Set(
  env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
);
