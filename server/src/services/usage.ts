import { env } from '../config/env';
import { HttpError } from '../lib/http';
import { Workspace, startOfMonth, type WorkspaceDoc } from '../models/Workspace';

type Plan = 'free' | 'pro' | 'internal';
export type Metered = 'searches' | 'enrichments' | 'emails' | 'aiGenerations' | 'verifications';

/** null means unlimited. Adjust when paid plans launch. */
export const PLAN_LIMITS: Record<Plan, Record<Metered, number | null>> = {
  free: {
    searches: env.FREE_PLAN_SEARCHES_PER_MONTH,
    enrichments: env.FREE_PLAN_ENRICHMENTS_PER_MONTH,
    emails: env.FREE_PLAN_EMAILS_PER_MONTH,
    aiGenerations: env.FREE_PLAN_AI_PER_MONTH,
    verifications: env.FREE_PLAN_VERIFICATIONS_PER_MONTH,
  },
  pro: { searches: 1000, enrichments: 20000, emails: 10000, aiGenerations: 10000, verifications: 10000 },
  internal: { searches: null, enrichments: null, emails: null, aiGenerations: null, verifications: null },
};

function rollPeriod(ws: WorkspaceDoc): void {
  const current = startOfMonth(new Date());
  const usage = ws.usage ?? (ws.usage = {} as never);
  if (!usage.periodStart || usage.periodStart.getTime() !== current.getTime()) {
    usage.periodStart = current;
    usage.searches = 0;
    usage.placesRequests = 0;
    usage.enrichments = 0;
    usage.emails = 0;
    usage.aiGenerations = 0;
    usage.verifications = 0;
  }
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceDoc> {
  const ws = await Workspace.findById(workspaceId);
  if (!ws) throw new HttpError(401, 'Your workspace no longer exists. Sign in again.');
  rollPeriod(ws);
  return ws;
}

/** Throws 402 if this would exceed the plan's monthly limit; otherwise records the usage. */
export async function consume(ws: WorkspaceDoc, kind: Metered, amount: number): Promise<void> {
  rollPeriod(ws);
  const limit = PLAN_LIMITS[(ws.plan as Plan) ?? 'free'][kind];
  const used = ws.usage?.[kind] ?? 0;
  if (limit !== null && used + amount > limit) {
    const left = Math.max(0, limit - used);
    const labels: Record<Metered, string> = {
      searches: 'searches',
      enrichments: 'website scans',
      emails: 'emails',
      aiGenerations: 'AI-written lines',
      verifications: 'email checks',
    };
    throw new HttpError(
      402,
      left === 0
        ? `You've used all ${limit} ${labels[kind]} for this month. Limits reset on the 1st.`
        : `Only ${left} ${labels[kind]} left this month. Select fewer, or wait for the reset on the 1st.`,
    );
  }
  ws.usage![kind] = used + amount;
  await ws.save();
}

export function usageSummary(ws: WorkspaceDoc) {
  rollPeriod(ws);
  const limits = PLAN_LIMITS[(ws.plan as Plan) ?? 'free'];
  return {
    plan: ws.plan,
    periodStart: ws.usage?.periodStart,
    searches: { used: ws.usage?.searches ?? 0, limit: limits.searches },
    enrichments: { used: ws.usage?.enrichments ?? 0, limit: limits.enrichments },
    emails: { used: ws.usage?.emails ?? 0, limit: limits.emails },
    aiGenerations: { used: ws.usage?.aiGenerations ?? 0, limit: limits.aiGenerations },
    verifications: { used: ws.usage?.verifications ?? 0, limit: limits.verifications },
    placesRequests: ws.usage?.placesRequests ?? 0,
  };
}
