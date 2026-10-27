import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { encrypt } from '../lib/crypto';
import { asyncHandler, HttpError } from '../lib/http';
import { Campaign } from '../models/Campaign';
import { Mailbox } from '../models/Mailbox';
import { User } from '../models/User';
import { forgetTransporter, sendFromMailbox, testMailbox, describeMailError } from '../services/mailer';

const router = Router();

const PRESETS = {
  gmail: { smtp: { host: 'smtp.gmail.com', port: 465, secure: true }, imap: { host: 'imap.gmail.com', port: 993, secure: true } },
  zoho: { smtp: { host: 'smtp.zoho.com', port: 465, secure: true }, imap: { host: 'imap.zoho.com', port: 993, secure: true } },
  zoho_in: { smtp: { host: 'smtp.zoho.in', port: 465, secure: true }, imap: { host: 'imap.zoho.in', port: 993, secure: true } },
  outlook: {
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
  },
} as const;

const serverSchema = z.object({
  host: z.string().trim().min(3).max(200),
  port: z.coerce.number().int().min(1).max(65535),
  secure: z.boolean(),
});

const createSchema = z.object({
  provider: z.enum(['gmail', 'zoho', 'zoho_in', 'outlook', 'custom']),
  fromName: z.string().trim().min(1, 'Enter the name people will see').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter the app password').max(300),
  dailyLimit: z.coerce.number().int().min(1).max(200).default(30),
  smtp: serverSchema.optional(),
  imap: serverSchema.nullable().optional(),
});

const updateSchema = z.object({
  fromName: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(1).max(300).optional(),
  dailyLimit: z.coerce.number().int().min(1).max(200).optional(),
  status: z.enum(['active', 'paused']).optional(),
  smtp: serverSchema.optional(),
  imap: serverSchema.nullable().optional(),
});

async function findOwned(id: string, workspaceId: string) {
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'Inbox not found.');
  const mb = await Mailbox.findOne({ _id: id, workspaceId });
  if (!mb) throw new HttpError(404, 'Inbox not found.');
  return mb;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const mailboxes = await Mailbox.find({ workspaceId: req.auth!.workspaceId }).sort({ createdAt: 1 });
    res.json(mailboxes.map((m) => m.toJSON()));
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = createSchema.parse(req.body);
    const preset = input.provider !== 'custom' ? PRESETS[input.provider] : null;
    const smtp = input.smtp ?? preset?.smtp;
    if (!smtp) throw new HttpError(400, 'Enter the SMTP server details for this inbox.');
    const imap = input.imap === null ? null : (input.imap ?? preset?.imap ?? null);
    const passEnc = encrypt(input.password);

    try {
      const mb = await Mailbox.create({
        workspaceId: req.auth!.workspaceId,
        provider: input.provider,
        fromName: input.fromName,
        email: input.email,
        dailyLimit: input.dailyLimit,
        smtp: { ...smtp, user: input.email, passEnc },
        imap: imap ? { ...imap, user: input.email, passEnc } : undefined,
      });
      const result = await testMailbox(mb);
      if (result.smtp) {
        mb.set({ status: 'error', lastError: `Sending: ${result.smtp}` });
        await mb.save();
      }
      res.status(201).json({ mailbox: mb.toJSON(), test: result });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new HttpError(409, 'This inbox is already connected.');
      throw err;
    }
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const mb = await findOwned(req.params.id, req.auth!.workspaceId);
    const input = updateSchema.parse(req.body);
    if (input.fromName) mb.fromName = input.fromName;
    if (input.dailyLimit) mb.dailyLimit = input.dailyLimit;
    if (input.status) mb.set({ status: input.status, lastError: input.status === 'active' ? undefined : mb.lastError });
    const passEnc = input.password ? encrypt(input.password) : undefined;
    if (input.smtp || passEnc) mb.set('smtp', { ...mb.toObject().smtp, ...(input.smtp ?? {}), ...(passEnc ? { passEnc } : {}) });
    if (input.imap === null) mb.set('imap', undefined);
    else if (input.imap || (passEnc && mb.imap?.host)) {
      mb.set('imap', { ...(mb.toObject().imap ?? { user: mb.email }), ...(input.imap ?? {}), ...(passEnc ? { passEnc } : {}) });
    }
    if (!mb.imap?.passEnc && mb.imap?.host) mb.set('imap.passEnc', mb.smtp!.passEnc);
    await mb.save();
    forgetTransporter(String(mb._id));
    res.json(mb.toJSON());
  }),
);

router.post(
  '/:id/test',
  asyncHandler(async (req, res) => {
    const mb = await findOwned(req.params.id, req.auth!.workspaceId);
    const result = await testMailbox(mb);
    if (result.smtp) mb.set({ status: 'error', lastError: `Sending: ${result.smtp}` });
    else if (mb.status === 'error') mb.set({ status: 'active', lastError: undefined });
    await mb.save();
    res.json({ mailbox: mb.toJSON(), test: result });
  }),
);

router.post(
  '/:id/send-test',
  asyncHandler(async (req, res) => {
    const mb = await findOwned(req.params.id, req.auth!.workspaceId);
    const user = await User.findById(req.auth!.userId, { email: 1 }).lean();
    const to = z.object({ to: z.string().email().optional() }).parse(req.body).to ?? user?.email;
    if (!to) throw new HttpError(400, 'Enter an address to send the test to.');
    try {
      await sendFromMailbox(mb, {
        to,
        subject: 'Test from your LeadPilot inbox',
        text: `This inbox is connected and can send email.\n\nSent from ${mb.email}.`,
        messageId: `<leadpilot-test.${Date.now()}@${mb.email.split('@')[1]}>`,
      });
    } catch (err) {
      throw new HttpError(400, `The test email wasn't sent: ${describeMailError(err)}`);
    }
    res.json({ sentTo: to });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const mb = await findOwned(req.params.id, req.auth!.workspaceId);
    const active = await Campaign.exists({ workspaceId: req.auth!.workspaceId, status: 'active', mailboxIds: mb._id });
    if (active) throw new HttpError(409, 'This inbox is sending for an active campaign. Pause the campaign or remove the inbox from it first.');
    await Campaign.updateMany({ workspaceId: req.auth!.workspaceId }, { $pull: { mailboxIds: mb._id } });
    await mb.deleteOne();
    forgetTransporter(String(mb._id));
    res.json({ ok: true });
  }),
);

export default router;
