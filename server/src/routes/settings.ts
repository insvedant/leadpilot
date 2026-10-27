import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, escapeRegex } from '../lib/http';
import { Suppression } from '../models/Suppression';
import { getWorkspace, usageSummary } from '../services/usage';
import { suppressEmail } from '../services/suppress';
import { aiAvailable } from '../services/ai';
import { verificationAvailable } from '../services/verify';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const ws = await getWorkspace(req.auth!.workspaceId);
    res.json({
      workspace: { name: ws.name, sender: ws.sender ?? {} },
      usage: usageSummary(ws),
      features: { ai: aiAvailable(), verification: verificationAvailable() },
    });
  }),
);

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  sender: z
    .object({
      companyName: z.string().trim().max(120),
      postalAddress: z.string().trim().max(300),
      website: z.string().trim().max(200),
    })
    .optional(),
});

router.patch(
  '/',
  asyncHandler(async (req, res) => {
    const input = updateSchema.parse(req.body);
    const ws = await getWorkspace(req.auth!.workspaceId);
    if (input.name) ws.name = input.name;
    if (input.sender) ws.set('sender', input.sender);
    await ws.save();
    res.json({ workspace: { name: ws.name, sender: ws.sender } });
  }),
);

// --- Do-not-contact list ------------------------------------------------------

router.get(
  '/suppression',
  asyncHandler(async (req, res) => {
    const { q, page } = z
      .object({ q: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1) })
      .parse(req.query);
    const filter: Record<string, unknown> = { workspaceId: req.auth!.workspaceId };
    if (q) filter.email = new RegExp(escapeRegex(q), 'i');
    const [items, total] = await Promise.all([
      Suppression.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 50).limit(50).lean(),
      Suppression.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / 50)) });
  }),
);

router.post(
  '/suppression',
  asyncHandler(async (req, res) => {
    const { emails } = z.object({ emails: z.string().max(100_000) }).parse(req.body);
    const list = [
      ...new Set(
        emails
          .split(/[\s,;]+/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
      ),
    ].slice(0, 5000);
    for (const email of list) await suppressEmail(req.auth!.workspaceId, email, 'manual');
    res.json({ added: list.length });
  }),
);

router.delete(
  '/suppression/:id',
  asyncHandler(async (req, res) => {
    await Suppression.deleteOne({ _id: req.params.id, workspaceId: req.auth!.workspaceId });
    res.json({ ok: true });
  }),
);

export default router;
