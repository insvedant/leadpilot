import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { asyncHandler, HttpError } from '../lib/http';
import { Campaign, type CampaignDoc } from '../models/Campaign';
import { Lead } from '../models/Lead';
import { Mailbox } from '../models/Mailbox';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { Workspace } from '../models/Workspace';
import { aiAvailable } from '../services/ai';
import { describeMailError, sendFromMailbox } from '../services/mailer';
import { addLeadsToCampaign, queueGeneration, reassignMailboxes, rerenderDrafts } from '../services/outreach';
import { footer, unsubscribeUrl } from '../services/scheduler';
import { DEFAULT_STEPS, unknownVars } from '../services/templating';
import { logFromRequest } from '../services/activity';

const router = Router();
const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

async function findCampaign(id: string, workspaceId: string): Promise<CampaignDoc> {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Campaign not found.');
  const c = await Campaign.findOne({ _id: id, workspaceId });
  if (!c) throw new HttpError(404, 'Campaign not found.');
  return c;
}

export async function statsFor(campaignIds: Types.ObjectId[]) {
  const rows = await Message.aggregate([
    { $match: { campaignId: { $in: campaignIds } } },
    {
      $group: {
        _id: '$campaignId',
        leads: { $sum: { $cond: [{ $eq: ['$step', 0] }, 1, 0] } },
        review: { $sum: { $cond: [{ $in: ['$status', ['pending', 'generating', 'draft']] }, 1, 0] } },
        writing: { $sum: { $cond: [{ $in: ['$status', ['pending', 'generating']] }, 1, 0] } },
        queued: { $sum: { $cond: [{ $in: ['$status', ['approved', 'sending']] }, 1, 0] } },
        sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } },
        replied: { $sum: { $cond: [{ $ifNull: ['$repliedAt', false] }, 1, 0] } },
        bounced: { $sum: { $cond: [{ $ifNull: ['$bouncedAt', false] }, 1, 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
      },
    },
  ]);
  const empty = { leads: 0, review: 0, writing: 0, queued: 0, sent: 0, replied: 0, bounced: 0, failed: 0 };
  return new Map(rows.map((r) => [String(r._id), { ...empty, ...r, _id: undefined }]));
}

// --- Campaigns ----------------------------------------------------------------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const campaigns = await Campaign.find({ workspaceId: req.auth!.workspaceId, status: { $ne: 'archived' } })
      .sort({ updatedAt: -1 })
      .lean();
    const stats = await statsFor(campaigns.map((c) => c._id));
    res.json(campaigns.map((c) => ({ ...c, stats: stats.get(String(c._id)) ?? null })));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { name, timezone } = z
      .object({ name: z.string().trim().min(1).max(120).default('New campaign'), timezone: z.string().max(60).optional() })
      .parse(req.body);
    const mailboxes = await Mailbox.find({ workspaceId: req.auth!.workspaceId, status: { $ne: 'paused' } }, { _id: 1 }).lean();
    let tz = 'UTC';
    try {
      if (timezone) {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone });
        tz = timezone;
      }
    } catch {
      tz = 'UTC';
    }
    const campaign = await Campaign.create({
      workspaceId: req.auth!.workspaceId,
      name,
      mailboxIds: mailboxes.map((m) => m._id),
      steps: DEFAULT_STEPS,
      schedule: { timezone: tz },
    });
    logFromRequest(req, 'campaign.created', `Created campaign "${campaign.name}"`, { campaignId: String(campaign._id) });
    res.status(201).json(campaign);
  }),
);

router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    res.json({ aiAvailable: aiAvailable() });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    const stats = await statsFor([c._id]);
    res.json({ ...c.toObject(), stats: stats.get(String(c._id)) ?? null });
  }),
);

const stepSchema = z.object({
  delayDays: z.coerce.number().int().min(0).max(60).default(0),
  subject: z.string().max(200).default(''),
  body: z.string().trim().min(1, 'Every email needs a body').max(5000),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  mailboxIds: z.array(objectId).max(20).optional(),
  steps: z.array(stepSchema).min(1).max(4).optional(),
  ai: z.object({ enabled: z.boolean(), instructions: z.string().max(2000), useWebsite: z.boolean() }).optional(),
  schedule: z
    .object({
      timezone: z.string().max(60),
      days: z.array(z.number().int().min(0).max(6)).min(1, 'Pick at least one sending day'),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(1).max(24),
      minGapSec: z.number().int().min(60).max(3600),
      maxGapSec: z.number().int().min(60).max(3600),
    })
    .refine((s) => s.endHour > s.startHour, 'The sending window must end after it starts')
    .refine((s) => s.maxGapSec >= s.minGapSec, 'The longest gap must be at least the shortest gap')
    .optional(),
  requireVerified: z.boolean().optional(),
});

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    const input = updateSchema.parse(req.body);

    if (input.steps) {
      if (!input.steps[0].subject.trim()) throw new HttpError(400, 'The first email needs a subject line.');
      const unknown = [...new Set(input.steps.flatMap((s) => [...unknownVars(s.subject), ...unknownVars(s.body)]))];
      if (unknown.length) throw new HttpError(400, `Unknown variable: {{${unknown[0]}}}. Use the variable buttons to insert valid ones.`);
      input.steps[0].delayDays = 0;
    }
    if (input.schedule) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: input.schedule.timezone });
      } catch {
        throw new HttpError(400, 'That timezone is not recognised.');
      }
    }
    let mailboxesChanged = false;
    if (input.mailboxIds) {
      const owned = await Mailbox.find({ _id: { $in: input.mailboxIds }, workspaceId: req.auth!.workspaceId }, { _id: 1 }).lean();
      if (c.status === 'active' && !owned.length) throw new HttpError(400, 'An active campaign needs at least one inbox. Pause it first.');
      mailboxesChanged = owned.map(String).sort().join() !== c.mailboxIds.map(String).sort().join();
      c.set('mailboxIds', owned.map((m) => m._id));
    }
    if (input.name) c.name = input.name;
    if (input.steps) c.set('steps', input.steps);
    if (input.ai) c.set('ai', input.ai);
    if (input.schedule) c.set('schedule', input.schedule);
    if (input.requireVerified !== undefined) c.requireVerified = input.requireVerified;
    await c.save();

    if (mailboxesChanged) await reassignMailboxes(c);
    const rerendered = input.steps || mailboxesChanged ? await rerenderDrafts(c) : 0;
    res.json({ campaign: c, rerendered });
  }),
);

router.post(
  '/:id/start',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    if (/\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(env.PUBLIC_APP_URL)) {
      throw new HttpError(
        400,
        "Unsubscribe links would point to localhost, which recipients can't open. Deploy the app, or set PUBLIC_APP_URL to a public address, before sending real emails. Test emails still work.",
      );
    }
    const ws = await Workspace.findById(req.auth!.workspaceId);
    if (!ws?.sender?.companyName || !ws.sender.postalAddress) {
      throw new HttpError(400, 'Add your business name and postal address in Settings first. Every email footer must include them.');
    }
    const active = await Mailbox.countDocuments({ _id: { $in: c.mailboxIds }, status: 'active' });
    if (!active) throw new HttpError(400, 'Connect an inbox that is working and add it to this campaign before starting.');
    c.set({ status: 'active', pausedReason: undefined });
    await c.save();
    logFromRequest(req, 'campaign.started', `Started sending campaign "${c.name}"`, { campaignId: String(c._id) });
    res.json(c);
  }),
);

router.post(
  '/:id/pause',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    c.set({ status: 'paused', pausedReason: undefined });
    await c.save();
    logFromRequest(req, 'campaign.paused', `Paused campaign "${c.name}"`, { campaignId: String(c._id) });
    res.json(c);
  }),
);

router.post(
  '/:id/archive',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    await Message.updateMany(
      { campaignId: c._id, status: { $in: ['pending', 'generating', 'draft', 'approved'] } },
      { $set: { status: 'cancelled', error: 'Campaign archived' } },
    );
    c.set({ status: 'archived' });
    await c.save();
    res.json({ ok: true });
  }),
);

// --- Leads & drafts -------------------------------------------------------------

router.post(
  '/:id/leads',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    const { leadIds } = z.object({ leadIds: z.array(objectId).min(1).max(1000) }).parse(req.body);
    const result = await addLeadsToCampaign(c, leadIds);
    logFromRequest(req, 'campaign.leads_added', `Added ${result.added} leads to "${c.name}"`, { campaignId: String(c._id), ...result });
    res.json(result);
  }),
);

router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    const q = z
      .object({
        view: z.enum(['review', 'approved', 'sent', 'replied', 'problems', 'all']).default('review'),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .parse(req.query);
    const filter: Record<string, unknown> = { campaignId: c._id };
    if (q.view === 'review') filter.status = { $in: ['pending', 'generating', 'draft'] };
    if (q.view === 'approved') filter.status = { $in: ['approved', 'sending'] };
    if (q.view === 'sent') filter.status = 'sent';
    if (q.view === 'replied') filter.repliedAt = { $ne: null };
    if (q.view === 'problems') filter.$or = [{ status: { $in: ['failed', 'cancelled', 'skipped'] } }, { bouncedAt: { $ne: null } }];

    const sort: Record<string, 1 | -1> = q.view === 'sent' || q.view === 'replied' ? { sentAt: -1 } : { step: 1, createdAt: 1 };
    const [items, total] = await Promise.all([
      Message.find(filter)
        .sort(sort)
        .skip((q.page - 1) * q.limit)
        .limit(q.limit)
        .populate('leadId', 'name category context website emails emailChecks rating reviewCount status')
        .populate('mailboxId', 'email fromName')
        .lean(),
      Message.countDocuments(filter),
    ]);
    res.json({
      items: items.map(({ leadId, mailboxId, ...m }) => ({
        ...m,
        lead: leadId,
        mailbox: mailboxId,
        leadId: (leadId as { _id?: unknown } | null)?._id,
      })),
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / q.limit)),
    });
  }),
);

const idsSchema = z.object({ ids: z.array(objectId).max(1000).optional(), all: z.boolean().optional() });

router.post(
  '/:id/messages/approve',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    const { ids, all } = idsSchema.parse(req.body);
    if (!ids?.length && !all) throw new HttpError(400, 'Select emails to approve.');
    const filter: Record<string, unknown> = { campaignId: c._id, status: 'draft' };
    if (!all) filter._id = { $in: ids };
    // Never approve an email that's missing its subject or body
    filter.subject = { $nin: [null, ''] };
    filter.body = { $nin: [null, ''] };
    const result = await Message.updateMany(filter, { $set: { status: 'approved', error: undefined } });
    res.json({ approved: result.modifiedCount });
  }),
);

router.post(
  '/:id/messages/unapprove',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    const { ids } = idsSchema.parse(req.body);
    const result = await Message.updateMany(
      { campaignId: c._id, status: 'approved', step: 0, _id: { $in: ids ?? [] } },
      { $set: { status: 'draft' } },
    );
    res.json({ updated: result.modifiedCount });
  }),
);

router.post(
  '/:id/messages/skip',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    const { ids } = idsSchema.parse(req.body);
    const result = await Message.updateMany(
      { campaignId: c._id, _id: { $in: ids ?? [] }, status: { $in: ['pending', 'draft', 'approved', 'failed'] } },
      { $set: { status: 'skipped' } },
    );
    res.json({ skipped: result.modifiedCount });
  }),
);

router.post(
  '/:id/messages/retry',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    const { ids } = idsSchema.parse(req.body);
    const result = await Message.updateMany(
      { campaignId: c._id, _id: { $in: ids ?? [] }, status: { $in: ['failed', 'skipped'] } },
      { $set: { status: 'draft', error: undefined } },
    );
    res.json({ updated: result.modifiedCount });
  }),
);

router.post(
  '/:id/messages/regenerate',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    if (!aiAvailable()) throw new HttpError(400, 'Add ANTHROPIC_API_KEY to the server to write personal lines.');
    const { ids, all } = idsSchema.parse(req.body);
    const filter: Record<string, unknown> = { campaignId: c._id, step: 0, status: 'draft' };
    if (!all) filter._id = { $in: ids ?? [] };
    const messages = await Message.find(filter, { _id: 1 }).lean();
    await Message.updateMany({ _id: { $in: messages.map((m) => m._id) } }, { $set: { status: 'pending' } });
    queueGeneration(messages.map((m) => String(m._id)));
    res.json({ queued: messages.length });
  }),
);

const editSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is empty').max(200).optional(),
  body: z.string().trim().min(1, 'Email body is empty').max(8000).optional(),
  toEmail: z.string().trim().toLowerCase().email().optional(),
});

router.patch(
  '/:id/messages/:messageId',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    objectId.parse(req.params.messageId);
    const input = editSchema.parse(req.body);
    const msg = await Message.findOne({ _id: req.params.messageId, campaignId: c._id });
    if (!msg) throw new HttpError(404, 'Email not found.');
    if (!['draft', 'approved'].includes(msg.status)) throw new HttpError(409, 'This email has already been sent or stopped.');
    if (input.toEmail) {
      const lead = await Lead.findById(msg.leadId, { emails: 1 }).lean();
      if (!lead?.emails.includes(input.toEmail)) throw new HttpError(400, "That address isn't one of this lead's emails.");
    }
    msg.set(input);
    await msg.save();
    res.json(msg);
  }),
);

router.post(
  '/:id/messages/:messageId/test',
  asyncHandler(async (req, res) => {
    const c = await findCampaign(req.params.id, req.auth!.workspaceId);
    objectId.parse(req.params.messageId);
    const msg = await Message.findOne({ _id: req.params.messageId, campaignId: c._id });
    if (!msg) throw new HttpError(404, 'Email not found.');
    const [mb, ws, user] = await Promise.all([
      Mailbox.findById(msg.mailboxId),
      Workspace.findById(c.workspaceId),
      User.findById(req.auth!.userId, { email: 1 }).lean(),
    ]);
    if (!mb) throw new HttpError(400, 'This email has no inbox assigned.');
    try {
      await sendFromMailbox(mb, {
        to: user!.email,
        subject: `[Test] ${msg.subject}`,
        text: msg.body + footer(ws, unsubscribeUrl(String(c.workspaceId), 'test@example.com')),
        messageId: `<leadpilot-test.${Date.now()}@${mb.email.split('@')[1]}>`,
      });
    } catch (err) {
      throw new HttpError(400, `Test not sent: ${describeMailError(err)}`);
    }
    res.json({ sentTo: user!.email });
  }),
);

export default router;
