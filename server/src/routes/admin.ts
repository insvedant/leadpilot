import { Router } from 'express';
import mongoose, { Types } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import { asyncHandler, escapeRegex, HttpError } from '../lib/http';
import { forgetUserCache, isPlatformAdmin } from '../middleware/auth';
import { Activity, ACTIVITY_TYPES } from '../models/Activity';
import { Campaign } from '../models/Campaign';
import { Lead } from '../models/Lead';
import { Mailbox } from '../models/Mailbox';
import { Message } from '../models/Message';
import { User } from '../models/User';
import { Workspace } from '../models/Workspace';
import { logActivity } from '../services/activity';
import { bounceStats } from '../services/scheduler';
import { sendSystemEmail } from '../services/systemMail';
import { usageSummary } from '../services/usage';
import { statsFor } from './campaigns';

/**
 * Platform admin API. Mounted behind requireAuth + requireAdmin, so only ADMIN_EMAILS reach it.
 * Inbox passwords are never returned (Mailbox.toJSON strips them).
 */
const router = Router();
const ONLINE_MS = 5 * 60 * 1000;
const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid id');

function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function publicUser(u: Record<string, unknown> & { email: string; status?: string }) {
  return {
    _id: u._id,
    name: u.name,
    email: u.email,
    status: u.status ?? 'active',
    statusReason: u.statusReason,
    createdAt: u.createdAt,
    approvedAt: u.approvedAt,
    lastLoginAt: u.lastLoginAt,
    lastSeenAt: u.lastSeenAt,
    workspaceId: u.workspaceId,
    isAdmin: isPlatformAdmin(u.email),
  };
}

async function findUser(id: string) {
  objectId.parse(id);
  const user = await User.findById(id);
  if (!user) throw new HttpError(404, 'User not found.');
  return user;
}

// --- Overview -------------------------------------------------------------------

router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const now = Date.now();
    const today = startOfToday();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const [statusCounts, online, activeToday, pending, searchesToday, sentToday, repliesToday, bouncesToday, recent] = await Promise.all([
      User.aggregate([{ $group: { _id: { $ifNull: ['$status', 'active'] }, n: { $sum: 1 } } }]),
      User.find({ lastSeenAt: { $gte: new Date(now - ONLINE_MS) } }, { name: 1, email: 1, lastSeenAt: 1, status: 1 })
        .sort({ lastSeenAt: -1 })
        .limit(50)
        .lean(),
      User.countDocuments({ lastSeenAt: { $gte: today } }),
      User.find({ status: 'pending' }, { name: 1, email: 1, createdAt: 1, status: 1 }).sort({ createdAt: 1 }).limit(50).lean(),
      Activity.countDocuments({ type: 'search.run', createdAt: { $gte: today } }),
      Message.countDocuments({ sentAt: { $gte: today } }),
      Message.countDocuments({ repliedAt: { $gte: today } }),
      Message.countDocuments({ bouncedAt: { $gte: today } }),
      Activity.find({}).sort({ createdAt: -1 }).limit(15).populate('userId', 'name email').lean(),
    ]);

    // Workspaces with an unhealthy bounce rate over the last week
    const health = await Message.aggregate([
      { $match: { sentAt: { $gte: weekAgo } } },
      { $group: { _id: '$workspaceId', sent: { $sum: 1 }, bounced: { $sum: { $cond: [{ $ifNull: ['$bouncedAt', false] }, 1, 0] } } } },
      { $match: { sent: { $gte: 20 } } },
      { $project: { sent: 1, bounced: 1, rate: { $divide: ['$bounced', '$sent'] } } },
      { $match: { rate: { $gt: 0.03 } } },
      { $sort: { rate: -1 } },
      { $limit: 20 },
    ]);
    const owners = await User.find({ workspaceId: { $in: health.map((h) => h._id) } }, { name: 1, email: 1, workspaceId: 1 }).lean();
    const ownerByWs = new Map(owners.map((o) => [String(o.workspaceId), o]));

    const counts: Record<string, number> = { pending: 0, active: 0, suspended: 0, rejected: 0 };
    for (const r of statusCounts) counts[r._id as string] = r.n;

    res.json({
      users: { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0), online: online.length, activeToday },
      online: online.map((u) => publicUser(u as never)),
      pending: pending.map((u) => publicUser(u as never)),
      today: { searches: searchesToday, emailsSent: sentToday, replies: repliesToday, bounces: bouncesToday },
      flagged: health.map((h) => ({
        user: ownerByWs.get(String(h._id)) ? publicUser(ownerByWs.get(String(h._id)) as never) : null,
        sent: h.sent,
        bounced: h.bounced,
        rate: h.rate,
      })),
      recent: recent.map(({ userId, ...a }) => ({ ...a, user: userId })),
    });
  }),
);

// --- Users ------------------------------------------------------------------------

router.get(
  '/users',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        q: z.string().trim().max(100).optional(),
        status: z.enum(['pending', 'active', 'suspended', 'rejected']).optional(),
        sort: z.enum(['recent', 'seen', 'name']).default('recent'),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const filter: Record<string, unknown> = {};
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i');
      filter.$or = [{ name: rx }, { email: rx }];
    }
    if (q.status === 'active') filter.status = { $in: ['active', null] };
    else if (q.status) filter.status = q.status;
    const sort: Record<string, 1 | -1> = q.sort === 'seen' ? { lastSeenAt: -1 } : q.sort === 'name' ? { name: 1 } : { createdAt: -1 };

    const limit = 25;
    const [users, total] = await Promise.all([
      User.find(filter, { passwordHash: 0, resetTokenHash: 0, resetTokenExpires: 0 })
        .sort(sort)
        .skip((q.page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    const workspaces = new Map(
      (await Workspace.find({ _id: { $in: users.map((u) => u.workspaceId) } })).map((w) => [String(w._id), w]),
    );
    res.json({
      items: users.map((u) => {
        const ws = workspaces.get(String(u.workspaceId));
        return { ...publicUser(u as never), plan: ws?.plan ?? 'free', usage: ws ? usageSummary(ws) : null };
      }),
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

router.get(
  '/users/:id',
  asyncHandler(async (req, res) => {
    const user = await findUser(req.params.id);
    const ws = await Workspace.findById(user.workspaceId);
    const wsId = user.workspaceId;
    const [leads, leadsWithEmail, campaigns, sent, replied, bounced, mailboxes, bounce7] = await Promise.all([
      Lead.countDocuments({ workspaceId: wsId }),
      Lead.countDocuments({ workspaceId: wsId, 'emails.0': { $exists: true } }),
      Campaign.countDocuments({ workspaceId: wsId, status: { $ne: 'archived' } }),
      Message.countDocuments({ workspaceId: wsId, status: 'sent' }),
      Message.countDocuments({ workspaceId: wsId, repliedAt: { $ne: null } }),
      Message.countDocuments({ workspaceId: wsId, bouncedAt: { $ne: null } }),
      Mailbox.find({ workspaceId: wsId }).sort({ createdAt: 1 }),
      bounceStats(wsId),
    ]);
    res.json({
      user: publicUser(user.toObject() as never),
      workspace: ws
        ? {
            _id: ws._id,
            name: ws.name,
            plan: ws.plan,
            sender: ws.sender ?? {},
            usage: usageSummary(ws),
            bounceOverrideUntil: ws.bounceOverrideUntil,
            createdAt: (ws as unknown as { createdAt?: Date }).createdAt,
          }
        : null,
      totals: { leads, leadsWithEmail, campaigns, sent, replied, bounced },
      bounce7,
      mailboxes: mailboxes.map((m) => {
        const j = m.toJSON() as Record<string, unknown>;
        return { _id: j._id, email: j.email, fromName: j.fromName, provider: j.provider, status: j.status, dailyLimit: j.dailyLimit, lastError: j.lastError, lastSentAt: j.lastSentAt };
      }),
    });
  }),
);

router.get(
  '/users/:id/emails',
  asyncHandler(async (req, res) => {
    const user = await findUser(req.params.id);
    const q = z
      .object({
        view: z.enum(['sent', 'replied', 'bounced', 'queued', 'all']).default('sent'),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const filter: Record<string, unknown> = { workspaceId: user.workspaceId };
    if (q.view === 'sent') filter.status = 'sent';
    if (q.view === 'replied') filter.repliedAt = { $ne: null };
    if (q.view === 'bounced') filter.bouncedAt = { $ne: null };
    if (q.view === 'queued') filter.status = { $in: ['pending', 'generating', 'draft', 'approved', 'sending'] };
    const limit = 25;
    const [items, total] = await Promise.all([
      Message.find(filter)
        .sort(q.view === 'queued' ? { createdAt: -1 } : { sentAt: -1, createdAt: -1 })
        .skip((q.page - 1) * limit)
        .limit(limit)
        .populate('leadId', 'name category context')
        .populate('mailboxId', 'email fromName')
        .populate('campaignId', 'name')
        .lean(),
      Message.countDocuments(filter),
    ]);
    res.json({
      items: items.map(({ leadId, mailboxId, campaignId, ...m }) => ({ ...m, lead: leadId, mailbox: mailboxId, campaign: campaignId })),
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

router.get(
  '/users/:id/campaigns',
  asyncHandler(async (req, res) => {
    const user = await findUser(req.params.id);
    const campaigns = await Campaign.find({ workspaceId: user.workspaceId }, { steps: 0 }).sort({ updatedAt: -1 }).lean();
    const stats = await statsFor(campaigns.map((c) => c._id));
    res.json(campaigns.map((c) => ({ ...c, stats: stats.get(String(c._id)) ?? null })));
  }),
);

// --- Activity feed ------------------------------------------------------------------

router.get(
  '/activity',
  asyncHandler(async (req, res) => {
    const q = z
      .object({
        userId: objectId.optional(),
        type: z.string().max(40).optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const filter: Record<string, unknown> = {};
    if (q.userId) filter.userId = new Types.ObjectId(q.userId);
    if (q.type) {
      // "search" matches search.run, "email" matches email.sent/replied/bounced, etc.
      const types = ACTIVITY_TYPES.filter((t) => t === q.type || t.startsWith(`${q.type}.`));
      filter.type = { $in: types };
    }
    const limit = 40;
    const [items, total] = await Promise.all([
      Activity.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * limit).limit(limit).populate('userId', 'name email').lean(),
      Activity.countDocuments(filter),
    ]);
    res.json({
      items: items.map(({ userId, ...a }) => ({ ...a, user: userId })),
      total,
      page: q.page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

// --- Actions ---------------------------------------------------------------------------

async function setStatus(adminId: string, userId: string, status: 'active' | 'suspended' | 'rejected', reason?: string) {
  const user = await findUser(userId);
  if (isPlatformAdmin(user.email)) throw new HttpError(400, 'Admin accounts cannot be changed here. Remove the email from ADMIN_EMAILS first.');
  const previous = user.status ?? 'active';
  user.set({ status, statusReason: reason, statusChangedAt: new Date(), ...(status === 'active' && !user.approvedAt ? { approvedAt: new Date() } : {}) });
  await user.save();
  forgetUserCache(String(user._id));
  if (status !== 'active') {
    await Campaign.updateMany(
      { workspaceId: user.workspaceId, status: 'active' },
      { $set: { status: 'paused', pausedReason: status === 'suspended' ? 'Account suspended' : 'Account not approved' } },
    );
  }
  return { user, previous, adminId };
}

const approveSchema = z.object({ plan: z.enum(['free', 'pro', 'internal']).default('free') });

router.post(
  '/users/:id/approve',
  asyncHandler(async (req, res) => {
    const { plan } = approveSchema.parse(req.body ?? {});
    const { user, previous } = await setStatus(req.auth!.userId, req.params.id, 'active');
    await Workspace.updateOne({ _id: user.workspaceId }, { $set: { plan } });
    logActivity({ userId: req.auth!.userId, workspaceId: req.auth!.workspaceId }, previous === 'suspended' ? 'admin.reactivated' : 'admin.approved', `${previous === 'suspended' ? 'Reactivated' : 'Approved'} ${user.name} (${user.email}) on the ${plan} plan`, {
      targetUserId: String(user._id),
      plan,
    });
    if (previous === 'pending' || previous === 'rejected') {
      sendSystemEmail(
        user.email,
        'Your LeadPilot account is approved',
        `Hi ${user.name},\n\nYour account has been approved. Sign in here:\n${env.PUBLIC_APP_URL}/login`,
      ).catch((err) => console.error('Approval email failed', err));
    }
    res.json({ ok: true });
  }),
);

router.post(
  '/users/:id/reject',
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const { user } = await setStatus(req.auth!.userId, req.params.id, 'rejected', reason);
    logActivity({ userId: req.auth!.userId, workspaceId: req.auth!.workspaceId }, 'admin.rejected', `Rejected ${user.name} (${user.email})`, {
      targetUserId: String(user._id),
      reason,
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/users/:id/suspend',
  asyncHandler(async (req, res) => {
    const { reason } = z.object({ reason: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const { user } = await setStatus(req.auth!.userId, req.params.id, 'suspended', reason);
    logActivity({ userId: req.auth!.userId, workspaceId: req.auth!.workspaceId }, 'admin.suspended', `Suspended ${user.name} (${user.email})${reason ? `: ${reason}` : ''}`, {
      targetUserId: String(user._id),
      reason,
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/users/:id/plan',
  asyncHandler(async (req, res) => {
    const { plan } = approveSchema.parse(req.body ?? {});
    const user = await findUser(req.params.id);
    await Workspace.updateOne({ _id: user.workspaceId }, { $set: { plan } });
    logActivity({ userId: req.auth!.userId, workspaceId: req.auth!.workspaceId }, 'admin.plan_changed', `Moved ${user.name} (${user.email}) to the ${plan} plan`, {
      targetUserId: String(user._id),
      plan,
    });
    res.json({ ok: true });
  }),
);

router.post(
  '/users/:id/bounce-override',
  asyncHandler(async (req, res) => {
    const { days } = z.object({ days: z.number().int().min(0).max(14) }).parse(req.body ?? {});
    const user = await findUser(req.params.id);
    const until = days ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    await Workspace.updateOne({ _id: user.workspaceId }, until ? { $set: { bounceOverrideUntil: until } } : { $unset: { bounceOverrideUntil: 1 } });
    logActivity({ userId: req.auth!.userId, workspaceId: req.auth!.workspaceId }, 'admin.bounce_override', days ? `Let ${user.name} keep sending despite bounces for ${days} days` : `Turned bounce protection back on for ${user.name}`, {
      targetUserId: String(user._id),
      days,
    });
    res.json({ bounceOverrideUntil: until });
  }),
);

export default router;
