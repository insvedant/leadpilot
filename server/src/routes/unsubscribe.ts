import express, { Router } from 'express';
import { readUnsubToken } from '../lib/crypto';
import { asyncHandler } from '../lib/http';
import { suppressEmail } from '../services/suppress';

/** Public routes. The link is in every email footer and in the List-Unsubscribe header. */
const router = Router();
router.use(express.urlencoded({ extended: false, limit: '10kb' }));

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0F1A2B;color:#F1ECE2;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:24px}
  main{max-width:420px}
  h1{font-family:Georgia,serif;font-weight:400;font-size:2rem;margin:0 0 12px}
  p{color:#97A3BA;line-height:1.6}
  button{margin-top:16px;height:44px;padding:0 20px;border:0;border-radius:8px;background:#CDAE72;color:#0F1A2B;font-weight:700;font-size:15px;cursor:pointer}
</style></head><body><main>${body}</main></body></html>`;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

router.get('/:token', (req, res) => {
  const data = readUnsubToken(req.params.token);
  if (!data) {
    res.status(400).send(page('Link not valid', '<h1>This link is not valid</h1><p>It may have been copied incompletely.</p>'));
    return;
  }
  res.send(
    page(
      'Unsubscribe',
      `<h1>Unsubscribe</h1><p>Stop all further emails to <strong>${escape(data.e)}</strong> from this sender?</p>
       <form method="post"><button type="submit">Unsubscribe</button></form>`,
    ),
  );
});

// Handles both the button above and mail clients' one-click unsubscribe (RFC 8058)
router.post(
  '/:token',
  asyncHandler(async (req, res) => {
    const data = readUnsubToken(req.params.token);
    if (!data) {
      res.status(400).send(page('Link not valid', '<h1>This link is not valid</h1>'));
      return;
    }
    await suppressEmail(data.w, data.e, 'unsubscribed');
    res.send(page('Unsubscribed', `<h1>You're unsubscribed</h1><p>${escape(data.e)} won't receive any more emails from this sender.</p>`));
  }),
);

export default router;
