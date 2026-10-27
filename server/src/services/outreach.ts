import { Types } from 'mongoose';
import { HttpError } from '../lib/http';
import { Campaign, type CampaignDoc } from '../models/Campaign';
import { Lead, type LeadAttrs } from '../models/Lead';
import { Mailbox, type MailboxDoc } from '../models/Mailbox';
import { Message, type MessageDoc } from '../models/Message';
import { Suppression } from '../models/Suppression';
import { Workspace, type WorkspaceDoc } from '../models/Workspace';
import { aiAvailable, websiteSummary, writePersonalLine } from './ai';
import { InProcessQueue } from './queue';
import { leadVars, render } from './templating';
import { consume } from './usage';
import { BLOCKED, SENDABLE, type VerifyResult } from './verify';

const aiQueue = new InProcessQueue(3);

type LeadLike = Partial<LeadAttrs> & { _id: Types.ObjectId };

export function renderMessage(
  campaign: CampaignDoc,
  step: number,
  lead: Partial<LeadAttrs>,
  ws: WorkspaceDoc | null,
  mailbox: MailboxDoc | null | undefined,
  aiLine: string,
): { subject: string; body: string } {
  const vars = leadVars(lead, {
    aiLine,
    senderName: mailbox?.fromName,
    senderCompany: ws?.sender?.companyName ?? undefined,
  });
  const first = campaign.steps[0];
  const current = campaign.steps[step];
  const subjectTpl = current?.subject?.trim() ? current.subject : step > 0 ? `Re: ${first?.subject ?? ''}` : '';
  return { subject: render(subjectTpl, vars).replace(/\s+/g, ' '), body: render(current?.body ?? '', vars) };
}

/** Picks the best address on a lead: skips known-bad ones and, if required, unverified ones. */
function pickEmail(lead: LeadLike, requireVerified: boolean): { email?: string; reason?: 'no_email' | 'unverified' } {
  const checks = new Map<string, VerifyResult>((lead.emailChecks ?? []).map((c) => [c.email!, c.result as VerifyResult]));
  const usable = (lead.emails ?? []).filter((e) => !BLOCKED.includes(checks.get(e) as VerifyResult));
  if (!usable.length) return { reason: 'no_email' };
  if (!requireVerified) return { email: usable[0] };
  const verified = usable.find((e) => SENDABLE.includes(checks.get(e) as VerifyResult));
  return verified ? { email: verified } : { reason: 'unverified' };
}

export async function addLeadsToCampaign(campaign: CampaignDoc, leadIds: string[]) {
  const ws = await Workspace.findById(campaign.workspaceId);
  const mailboxes = await Mailbox.find({ _id: { $in: campaign.mailboxIds }, workspaceId: campaign.workspaceId });
  if (!mailboxes.length) throw new HttpError(400, 'Choose at least one sending inbox for this campaign first.');
  if (!campaign.steps[0]?.body) throw new HttpError(400, 'Write the first email before adding leads.');

  const leads = (await Lead.find({ _id: { $in: leadIds }, workspaceId: campaign.workspaceId }).lean()) as LeadLike[];
  const existing = new Set(
    (await Message.find({ campaignId: campaign._id, step: 0, leadId: { $in: leads.map((l) => l._id) } }, { leadId: 1 }).lean()).map((m) =>
      String(m.leadId),
    ),
  );
  const suppressed = new Set(
    (await Suppression.find({ workspaceId: campaign.workspaceId, email: { $in: leads.flatMap((l) => l.emails ?? []) } }, { email: 1 }).lean()).map(
      (s) => s.email,
    ),
  );

  // Spread leads across inboxes, starting with the least loaded
  const load = new Map<string, number>();
  for (const mb of mailboxes) {
    load.set(String(mb._id), await Message.countDocuments({ campaignId: campaign._id, mailboxId: mb._id, step: 0 }));
  }
  const nextMailbox = () => {
    const mb = [...mailboxes].sort((a, b) => load.get(String(a._id))! - load.get(String(b._id))!)[0];
    load.set(String(mb._id), load.get(String(mb._id))! + 1);
    return mb;
  };

  const useAi = campaign.ai?.enabled && aiAvailable();
  const counts = { added: 0, alreadyAdded: 0, noEmail: 0, unverified: 0, doNotContact: 0 };
  const created: Types.ObjectId[] = [];

  for (const lead of leads) {
    if (existing.has(String(lead._id))) {
      counts.alreadyAdded++;
      continue;
    }
    if (lead.status === 'do_not_contact') {
      counts.doNotContact++;
      continue;
    }
    const picked = pickEmail({ ...lead, emails: (lead.emails ?? []).filter((e) => !suppressed.has(e)) }, Boolean(campaign.requireVerified));
    if (!picked.email) {
      if ((lead.emails ?? []).some((e) => suppressed.has(e))) counts.doNotContact++;
      else counts[picked.reason === 'unverified' ? 'unverified' : 'noEmail']++;
      continue;
    }
    const mailbox = nextMailbox();
    const rendered = renderMessage(campaign, 0, lead, ws, mailbox, '');
    try {
      const msg = await Message.create({
        workspaceId: campaign.workspaceId,
        campaignId: campaign._id,
        leadId: lead._id,
        mailboxId: mailbox._id,
        step: 0,
        toEmail: picked.email,
        ...rendered,
        status: useAi ? 'pending' : 'draft',
      });
      created.push(msg._id);
      counts.added++;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) counts.alreadyAdded++;
      else throw err;
    }
  }

  if (useAi && created.length) queueGeneration(created.map(String));
  return { ...counts, aiQueued: useAi ? created.length : 0, aiAvailable: aiAvailable() };
}

export function queueGeneration(messageIds: string[]): void {
  for (const id of messageIds) aiQueue.push(() => generateForMessage(id));
}

async function generateForMessage(id: string): Promise<void> {
  const msg = await Message.findOneAndUpdate(
    { _id: id, status: { $in: ['pending', 'draft'] } },
    { $set: { status: 'generating', error: undefined } },
    { new: true },
  );
  if (!msg) return;
  const [campaign, lead, ws, mailbox] = await Promise.all([
    Campaign.findById(msg.campaignId),
    Lead.findById(msg.leadId).lean(),
    Workspace.findById(msg.workspaceId),
    Mailbox.findById(msg.mailboxId),
  ]);
  if (!campaign || !lead || !ws) {
    msg.set({ status: 'draft', error: 'Lead or campaign no longer exists' });
    await msg.save();
    return;
  }

  try {
    await consume(ws, 'aiGenerations', 1);
    const websiteText = campaign.ai?.useWebsite && lead.website ? await websiteSummary(lead.website) : undefined;
    const aiLine = await writePersonalLine({ lead, websiteText, instructions: campaign.ai?.instructions ?? '' });
    const rendered = renderMessage(campaign, msg.step, lead, ws, mailbox, aiLine);
    msg.set({ aiLine, ...rendered, status: 'draft', error: undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI line failed';
    msg.set({ status: 'draft', error: `Personal line not written: ${message}`.slice(0, 300) });
  }
  await msg.save();
}

/** Re-applies the campaign's current template to drafts, keeping each one's personal line. */
export async function rerenderDrafts(campaign: CampaignDoc, onlyIds?: string[]): Promise<number> {
  const query: Record<string, unknown> = { campaignId: campaign._id, status: { $in: ['draft', 'approved'] } };
  if (onlyIds?.length) query._id = { $in: onlyIds };
  const messages = await Message.find(query);
  if (!messages.length) return 0;
  const ws = await Workspace.findById(campaign.workspaceId);
  const leads = new Map(
    (await Lead.find({ _id: { $in: messages.map((m) => m.leadId) } }).lean()).map((l) => [String(l._id), l]),
  );
  const mailboxes = new Map((await Mailbox.find({ _id: { $in: campaign.mailboxIds } })).map((m) => [String(m._id), m]));
  let n = 0;
  for (const msg of messages) {
    const lead = leads.get(String(msg.leadId));
    if (!lead) continue;
    msg.set(renderMessage(campaign, msg.step, lead, ws, mailboxes.get(String(msg.mailboxId)), msg.aiLine ?? ''));
    await msg.save();
    n++;
  }
  return n;
}

/** When inboxes are removed from a campaign, move their unsent first emails to the remaining ones. */
export async function reassignMailboxes(campaign: CampaignDoc): Promise<void> {
  const keep = campaign.mailboxIds.map(String);
  if (!keep.length) return;
  const orphaned: MessageDoc[] = await Message.find({
    campaignId: campaign._id,
    step: 0,
    status: { $in: ['pending', 'generating', 'draft', 'approved'] },
    mailboxId: { $nin: campaign.mailboxIds },
  });
  orphaned.forEach((msg, i) => msg.set('mailboxId', new Types.ObjectId(keep[i % keep.length])));
  await Promise.all(orphaned.map((m) => m.save()));
  if (orphaned.length) await rerenderDrafts(campaign, orphaned.map((m) => String(m._id)));
}

/** Messages stuck in "generating" when the server stopped get another try on boot. */
export async function resumeGeneration(): Promise<void> {
  const stuck = await Message.find({ status: { $in: ['pending', 'generating'] } }, { _id: 1 }).lean();
  if (!stuck.length) return;
  await Message.updateMany({ _id: { $in: stuck.map((m) => m._id) } }, { $set: { status: 'pending' } });
  console.log(`Resuming ${stuck.length} AI drafts`);
  queueGeneration(stuck.map((m) => String(m._id)));
}
