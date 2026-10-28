import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { adminEmails, env } from '../config/env';
import { randomToken, sha256 } from '../lib/crypto';
import { sendSystemEmail } from '../services/systemMail';
import { asyncHandler, HttpError } from '../lib/http';
import { clearSession, isPlatformAdmin, requireAuth, signSession, STATUS_MESSAGES } from '../middleware/auth';
import { logActivity } from '../services/activity';
import { User } from '../models/User';
import { Workspace } from '../models/Workspace';
import { getWorkspace, usageSummary } from '../services/usage';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Wait 15 minutes and try again.' },
});

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { name, email, password } = registerSchema.parse(req.body);
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');

    const workspace = await Workspace.create({
      name: `${name.split(' ')[0]}'s workspace`,
      plan: adminEmails.has(email) ? 'internal' : 'free',
    });
    const admin = isPlatformAdmin(email);
    const user = await User.create({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      workspaceId: workspace._id,
      role: 'owner',
      status: admin ? 'active' : 'pending',
      statusChangedAt: new Date(),
      approvedAt: admin ? new Date() : undefined,
      lastLoginAt: admin ? new Date() : undefined,
    });
    workspace.ownerId = user._id;
    await workspace.save();
    logActivity({ userId: user._id, workspaceId: workspace._id }, 'auth.register', `${name} (${email}) signed up`);

    if (admin) {
      signSession(res, String(user._id), String(workspace._id));
      res.status(201).json({ user: { id: user._id, name: user.name, email: user.email }, pending: false });
      return;
    }

    // Tell every platform admin there's someone to approve
    for (const to of adminEmails) {
      sendSystemEmail(
        to,
        `New LeadPilot sign-up: ${name}`,
        `${name} (${email}) created an account and is waiting for approval.\n\nReview it here:\n${env.PUBLIC_APP_URL}/admin/users/${user._id}`,
      ).catch((err) => console.error('Admin notification failed', err));
    }
    res.status(202).json({ pending: true });
  }),
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await User.findOne({ email });
    // Same message either way so the form doesn't reveal which emails have accounts
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new HttpError(401, 'That email and password combination is incorrect.');
    }
    const status = user.status ?? 'active';
    if (status !== 'active' && !isPlatformAdmin(user.email)) {
      throw new HttpError(403, STATUS_MESSAGES[status] ?? 'This account cannot sign in.');
    }
    user.set({ lastLoginAt: new Date(), lastSeenAt: new Date() });
    await user.save();
    signSession(res, String(user._id), String(user.workspaceId));
    logActivity({ userId: user._id, workspaceId: user.workspaceId }, 'auth.login', `${user.name} signed in`);
    res.json({ user: { id: user._id, name: user.name, email: user.email } });
  }),
);

router.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.auth!.userId, { name: 1, email: 1, role: 1 }).lean();
    if (!user) throw new HttpError(401, 'Sign in to continue.');
    const ws = await getWorkspace(req.auth!.workspaceId);
    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role, isAdmin: isPlatformAdmin(user.email) },
      workspace: { id: ws._id, name: ws.name, usage: usageSummary(ws) },
    });
  }),
);

router.post(
  '/forgot',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email('Enter a valid email') }).parse(req.body);
    const user = await User.findOne({ email });
    if (user) {
      const token = randomToken();
      user.set({ resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000) });
      await user.save();
      const link = `${env.PUBLIC_APP_URL}/reset?token=${token}`;
      await sendSystemEmail(
        email,
        'Reset your LeadPilot password',
        `Hi ${user.name},\n\nUse this link to choose a new password. It works for one hour:\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
      ).catch((err) => console.error('Password reset email failed', err));
    }
    // Same answer whether or not the account exists
    res.json({ ok: true });
  }),
);

router.post(
  '/reset',
  authLimiter,
  asyncHandler(async (req, res) => {
    const { token, password } = z
      .object({ token: z.string().min(20).max(200), password: z.string().min(8, 'Use at least 8 characters').max(200) })
      .parse(req.body);
    const user = await User.findOne({ resetTokenHash: sha256(token), resetTokenExpires: { $gt: new Date() } });
    if (!user) throw new HttpError(400, 'This reset link has expired or was already used. Request a new one.');
    user.set({ passwordHash: await bcrypt.hash(password, 12), resetTokenHash: undefined, resetTokenExpires: undefined });
    await user.save();
    const canSignIn = (user.status ?? 'active') === 'active' || isPlatformAdmin(user.email);
    if (canSignIn) signSession(res, String(user._id), String(user.workspaceId));
    res.json({ ok: true, signedIn: canSignIn, message: canSignIn ? undefined : STATUS_MESSAGES[user.status ?? 'pending'] });
  }),
);

router.post(
  '/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { current, password } = z
      .object({ current: z.string().min(1, 'Enter your current password'), password: z.string().min(8, 'Use at least 8 characters').max(200) })
      .parse(req.body);
    const user = await User.findById(req.auth!.userId);
    if (!user || !(await bcrypt.compare(current, user.passwordHash))) throw new HttpError(400, 'Your current password is incorrect.');
    user.passwordHash = await bcrypt.hash(password, 12);
    await user.save();
    res.json({ ok: true });
  }),
);

export default router;
