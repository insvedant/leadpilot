import { Lead } from '../models/Lead';
import { Mailbox, type MailboxDoc } from '../models/Mailbox';
import { Message } from '../models/Message';
import { imapClient, describeMailError } from './mailer';
import { stopSequence, suppressEmail } from './suppress';

// Also matches the old 'lodestar.' prefix so replies to emails sent before the rename are still caught
const ID_RE = /(?:leadpilot|lodestar)\.([a-f0-9]{24})\./g;

function ourIds(text: string): string[] {
  return [...new Set([...text.matchAll(ID_RE)].map((m) => m[1]))];
}

async function markReplied(ids: string[], from: string): Promise<void> {
  const messages = await Message.find({ _id: { $in: ids }, status: 'sent' });
  for (const msg of messages) {
    if (!msg.repliedAt) {
      msg.set({ repliedAt: new Date(), replyFrom: from });
      await msg.save();
    }
    await stopSequence(msg.campaignId, msg.leadId, 'Stopped: lead replied');
    await Lead.updateOne({ _id: msg.leadId, status: { $in: ['new', 'contacted'] } }, { $set: { status: 'replied' } });
  }
}

async function markBounced(ids: string[]): Promise<void> {
  const messages = await Message.find({ _id: { $in: ids } });
  for (const msg of messages) {
    if (!msg.bouncedAt) {
      msg.set({ bouncedAt: new Date() });
      await msg.save();
    }
    await stopSequence(msg.campaignId, msg.leadId, 'Stopped: address bounced');
    await suppressEmail(msg.workspaceId, msg.toEmail, 'bounced');
  }
}

async function pollMailbox(mb: MailboxDoc): Promise<void> {
  const client = imapClient(mb);
  await client.connect();
  const bounceUids: number[] = [];
  let maxUid = mb.imapLastUid ?? 0;

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const found = mb.imapLastUid
        ? await client.search({ uid: `${mb.imapLastUid + 1}:*` }, { uid: true })
        : await client.search({ since: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) }, { uid: true });
      const uids = (found || []).filter((u) => u > (mb.imapLastUid ?? 0)).slice(-300);

      if (uids.length) {
        for await (const m of client.fetch(uids, { uid: true, envelope: true, headers: true }, { uid: true })) {
          maxUid = Math.max(maxUid, m.uid);
          const headers = m.headers?.toString('utf8') ?? '';
          const from = m.envelope?.from?.[0]?.address ?? '';
          const isBounce = /mailer-daemon|postmaster/i.test(from) || /^content-type:\s*multipart\/report/im.test(headers);
          if (isBounce) {
            bounceUids.push(m.uid);
            continue;
          }
          const ids = ourIds(headers);
          if (!ids.length) continue;
          // Out-of-office and other automatic replies shouldn't stop a sequence
          const automatic =
            /^auto-submitted:\s*(?!no\b)\S+/im.test(headers) ||
            /^x-autoreply:/im.test(headers) ||
            /^x-autorespond:/im.test(headers) ||
            /^precedence:\s*(auto_reply|bulk|junk)/im.test(headers);
          if (!automatic) await markReplied(ids, from);
        }

        // Bounce notices carry the original message inside the body, so read them in full (after the fetch loop ends)
        for (const uid of bounceUids) {
          const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
          const source = full && full.source ? full.source.toString('utf8').slice(0, 400_000) : '';
          const ids = ourIds(source);
          if (ids.length) await markBounced(ids);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }

  mb.set({ imapLastUid: maxUid || mb.imapLastUid, imapCheckedAt: new Date() });
  if (mb.lastError?.startsWith('Reply check')) mb.set({ lastError: undefined });
  await mb.save();
}

let running = false;

async function pollAll(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const mailboxes = await Mailbox.find({ status: { $ne: 'paused' }, 'imap.host': { $nin: [null, ''] } });
    for (const mb of mailboxes) {
      try {
        await pollMailbox(mb);
      } catch (err) {
        mb.set({ lastError: `Reply check failed: ${describeMailError(err)}` });
        await mb.save().catch(() => undefined);
      }
    }
  } finally {
    running = false;
  }
}

export function startReplyPoller(): void {
  setInterval(() => void pollAll(), 3 * 60 * 1000);
  setTimeout(() => void pollAll(), 15_000);
  console.log('Reply and bounce checker running');
}
