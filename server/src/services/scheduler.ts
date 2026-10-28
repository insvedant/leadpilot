import { randomBytes } from 'node:crypto';
import { env } from '../config/env';
import { makeUnsubToken } from '../lib/crypto';
import { Campaign, type CampaignDoc } from '../models/Campaign';
import { Lead } from '../models/Lead';
import { Mailbox, type MailboxDoc } from '../models/Mailbox';
import { Message, type MessageDoc } from '../models/Message';
import { Suppression } from '../models/Suppression';
import { Workspace, type WorkspaceDoc } from '../models/Workspace';
import { describeMailError, sendFromMailbox } from './mailer';
import { renderMessage } from './outreach';
import { consume } from './usage';
import { logActivity } from './activity';
import { adminEmails, env as appEnv } from '../config/env';
import { sendSystemEmail } from './systemMail';
import { User } from '../models/User';

// Bounce protection: a workspace bouncing more than 5% over the last 7 days (with at least
// 20 emails sent) has every campaign paused. High bounces get inboxes and domains blocked.
const BOUNCE_LIMIT = 0.05;
const BOUNCE_MIN_SENT = 20;
const healthCache = new Map<string, boolean>();

export async function bounceStats(workspaceId: unknown, days = 7): Promise<{ sent: number; bounced: number; rate: number }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [sent, bounced] = await Promise.all([
    Message.countDocuments({ workspaceId, sentAt: { $gte: since } }),
    Message.countDocuments({ workspaceId, sentAt: { $gte: since }, bouncedAt: { $ne: null } }),
  ]);
  return { sent, bounced, rate: sent ? bounced / sent : 0 };
}

async function bounceGuard(campaign: CampaignDoc): Promise<boolean> {
  const key = String(campaign.workspaceId);
  if (healthCache.has(key)) return healthCache.get(key)!;
  const ws = await Workspace.findById(campaign.workspaceId, { bounceOverrideUntil: 1 }).lean();
  if (ws?.bounceOverrideUntil && ws.bounceOverrideUntil > new Date()) {
    healthCache.set(key, false);
    return false;
  }
  const { sent, bounced, rate } = await bounceStats(campaign.workspaceId);
  const unhealthy = sent >= BOUNCE_MIN_SENT && rate > BOUNCE_LIMIT;
  healthCache.set(key, unhealthy);
  if (!unhealthy) return false;

  const pct = Math.round(rate * 100);
  const reason = `${pct}% of emails bounced in the last 7 days (${bounced} of ${sent}). Clean or verify your lead list before sending more.`;
  const paused = await Campaign.updateMany({ workspaceId: campaign.workspaceId, status: 'active' }, { $set: { status: 'paused', pausedReason: reason } });
  if (paused.modifiedCount) {
    const owner = await User.findOne({ workspaceId: campaign.workspaceId }, { name: 1, email: 1 }).lean();
    logActivity({ userId: owner?._id, workspaceId: campaign.workspaceId }, 'campaign.auto_paused', `All campaigns paused: ${reason}`, { sent, bounced });
    const body = `Campaigns for ${owner?.name ?? 'a workspace'} (${owner?.email ?? 'unknown'}) were paused automatically.\n\n${reason}\n\n${appEnv.PUBLIC_APP_URL}/admin/users/${owner?._id ?? ''}`;
    for (const to of adminEmails) sendSystemEmail(to, 'LeadPilot: campaigns paused for high bounces', body).catch(() => undefined);
    if (owner?.email) {
      sendSystemEmail(owner.email, 'Your LeadPilot campaigns were paused', `Hi ${owner.name},\n\n${reason}\n\nOnce your list is cleaned up, you can start your campaigns again from the Outreach page.`).catch(() => undefined);
    }
  }
  return true;
}

const DAY = 24 * 60 * 60 * 1000;
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function inSendingWindow(campaign: CampaignDoc, now = new Date()): boolean {
  const s = campaign.schedule!;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: s.timezone || 'UTC',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now);
    const day = WEEKDAYS[parts.find((p) => p.type === 'weekday')?.value ?? ''] ?? -1;
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
    return s.days.includes(day) && hour >= s.startHour && hour < s.endHour;
  } catch {
    return false;
  }
}

export function footer(ws: WorkspaceDoc | null, unsubscribeUrl: string): string {
  const who = [ws?.sender?.companyName, ws?.sender?.postalAddress].filter(Boolean).join(', ');
  return `\n\n--\n${who}\nDon't want emails like this? Unsubscribe: ${unsubscribeUrl}`;
}

export function unsubscribeUrl(workspaceId: string, email: string): string {
  return `${env.PUBLIC_APP_URL}/api/u/${makeUnsubToken(workspaceId, email)}`;
}

async function sentInLast24h(mailboxId: unknown): Promise<number> {
  return Message.countDocuments({ mailboxId, sentAt: { $gte: new Date(Date.now() - DAY) } });
}

async function sendOne(campaign: CampaignDoc, ws: WorkspaceDoc, mb: MailboxDoc, candidate: MessageDoc): Promise<void> {
  const msg = await Message.findOneAndUpdate(
    { _id: candidate._id, status: 'approved' },
    { $set: { status: 'sending' } },
    { new: true },
  );
  if (!msg) return;

  const cancel = async (why: string) => {
    msg.set({ status: 'cancelled', error: why });
    await msg.save();
  };

  const lead = await Lead.findById(msg.leadId);
  if (!lead) return cancel('Lead was deleted');
  if (lead.status === 'do_not_contact') return cancel('Lead is marked do not contact');
  if (await Suppression.exists({ workspaceId: campaign.workspaceId, email: msg.toEmail })) {
    return cancel('Address is on the do-not-contact list');
  }
  const earlier = await Message.find({ campaignId: campaign._id, leadId: msg.leadId, step: { $lt: msg.step } }).sort({ step: 1 });
  if (earlier.some((m) => m.repliedAt || m.bouncedAt)) return cancel('Lead replied or the address bounced');

  try {
    await consume(ws, 'emails', 1);
  } catch (err) {
    msg.set({ status: 'approved' });
    await msg.save();
    campaign.set({ status: 'paused', pausedReason: err instanceof Error ? err.message : 'Monthly email limit reached' });
    await campaign.save();
    return;
  }

  const domain = mb.email.split('@')[1] ?? 'localhost';
  // The message ID carries our database id, so replies and bounces can be matched back to it
  const messageIdHeader = `<leadpilot.${msg._id}.${randomBytes(4).toString('hex')}@${domain}>`;
  const refs = earlier.map((m) => m.messageIdHeader).filter((x): x is string => Boolean(x));
  const unsub = unsubscribeUrl(String(campaign.workspaceId), msg.toEmail);

  try {
    await sendFromMailbox(mb, {
      to: msg.toEmail,
      subject: msg.subject,
      text: msg.body + footer(ws, unsub),
      messageId: messageIdHeader,
      inReplyTo: refs.at(-1),
      references: refs.length ? refs : undefined,
      unsubscribeUrl: unsub,
    });
  } catch (err) {
    const reason = describeMailError(err);
    msg.set({ status: 'failed', error: reason });
    await msg.save();
    const code = (err as { code?: string }).code;
    mb.set({ lastError: reason, ...(code === 'EAUTH' ? { status: 'error' } : {}) });
    await mb.save();
    return;
  }

  const now = new Date();
  const s = campaign.schedule!;
  const gap = s.minGapSec + Math.random() * Math.max(0, s.maxGapSec - s.minGapSec);
  msg.set({ status: 'sent', sentAt: now, messageIdHeader, error: undefined });
  await msg.save();
  mb.set({ lastSentAt: now, nextAllowedAt: new Date(now.getTime() + gap * 1000), lastError: undefined });
  await mb.save();
  if (lead.status === 'new') {
    lead.status = 'contacted';
    await lead.save();
  }
  logActivity(
    { userId: ws.ownerId, workspaceId: campaign.workspaceId },
    'email.sent',
    `${mb.email} emailed ${msg.toEmail} (${lead.name}): "${msg.subject}"`,
    { messageId: String(msg._id), campaignId: String(campaign._id), from: mb.email, to: msg.toEmail, step: msg.step },
  );

  // Queue the next follow-up in this thread
  const nextStep = campaign.steps[msg.step + 1];
  if (nextStep) {
    const rendered = renderMessage(campaign, msg.step + 1, lead.toObject(), ws, mb, msg.aiLine ?? '');
    await Message.create({
      workspaceId: msg.workspaceId,
      campaignId: msg.campaignId,
      leadId: msg.leadId,
      mailboxId: mb._id,
      step: msg.step + 1,
      toEmail: msg.toEmail,
      aiLine: msg.aiLine,
      ...rendered,
      status: 'approved',
      scheduledAt: new Date(now.getTime() + (nextStep.delayDays ?? 3) * DAY),
    }).catch((err: { code?: number }) => {
      if (err.code !== 11000) throw err;
    });
  }
}

async function processCampaign(campaign: CampaignDoc): Promise<void> {
  if (!inSendingWindow(campaign)) return;
  if (await bounceGuard(campaign)) return;
  const ws = await Workspace.findById(campaign.workspaceId);
  if (!ws) return;
  const mailboxes = await Mailbox.find({ _id: { $in: campaign.mailboxIds }, status: 'active' });
  const now = new Date();

  for (const mb of mailboxes) {
    if (mb.nextAllowedAt && mb.nextAllowedAt > now) continue;
    if ((await sentInLast24h(mb._id)) >= mb.dailyLimit) continue;
    const next = await Message.findOne({
      campaignId: campaign._id,
      mailboxId: mb._id,
      status: 'approved',
      $or: [{ scheduledAt: null }, { scheduledAt: { $exists: false } }, { scheduledAt: { $lte: now } }],
    }).sort({ step: -1, createdAt: 1 });
    if (next) await sendOne(campaign, ws, mb, next);
  }
}

let running = false;

async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // A message left in "sending" by a crash goes back to the queue
    await Message.updateMany(
      { status: 'sending', updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } },
      { $set: { status: 'approved' } },
    );
    healthCache.clear();
    const campaigns = await Campaign.find({ status: 'active' });
    for (const c of campaigns) {
      try {
        await processCampaign(c);
      } catch (err) {
        console.error(`Campaign ${c._id} send error`, err);
      }
    }
  } finally {
    running = false;
  }
}

export function startScheduler(): void {
  setInterval(() => void tick(), 20_000);
  setTimeout(() => void tick(), 5_000);
  console.log('Email scheduler running');
}
