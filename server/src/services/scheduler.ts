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
