import nodemailer, { type Transporter } from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { decrypt } from '../lib/crypto';
import type { MailboxDoc } from '../models/Mailbox';

const cache = new Map<string, { key: string; transporter: Transporter }>();

function transporterFor(mb: MailboxDoc): Transporter {
  const smtp = mb.smtp!;
  const key = `${smtp.host}:${smtp.port}:${smtp.user}:${smtp.passEnc}`;
  const cached = cache.get(String(mb._id));
  if (cached && cached.key === key) return cached.transporter;
  const transporter = nodemailer.createTransport({
    host: smtp.host!,
    port: smtp.port!,
    secure: Boolean(smtp.secure),
    auth: { user: smtp.user!, pass: decrypt(smtp.passEnc!) },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 45_000,
  });
  cache.set(String(mb._id), { key, transporter });
  return transporter;
}

export function forgetTransporter(mailboxId: string) {
  cache.delete(mailboxId);
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  unsubscribeUrl?: string;
}

export async function sendFromMailbox(mb: MailboxDoc, email: OutgoingEmail): Promise<void> {
  const headers: Record<string, string> = {};
  if (email.unsubscribeUrl) {
    // One-click unsubscribe (RFC 8058), expected by Gmail and Yahoo
    headers['List-Unsubscribe'] = `<${email.unsubscribeUrl}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  await transporterFor(mb).sendMail({
    from: { name: mb.fromName, address: mb.email },
    to: email.to,
    subject: email.subject,
    text: email.text,
    messageId: email.messageId,
    inReplyTo: email.inReplyTo,
    references: email.references,
    headers,
  });
}

export function imapClient(mb: MailboxDoc): ImapFlow {
  const imap = mb.imap!;
  return new ImapFlow({
    host: imap.host!,
    port: imap.port!,
    secure: Boolean(imap.secure),
    auth: { user: imap.user!, pass: decrypt(imap.passEnc!) },
    logger: false,
    socketTimeout: 60_000,
  });
}

function describe(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; message?: string; authenticationFailed?: boolean };
  if (e?.code === 'EAUTH' || e?.authenticationFailed) {
    return 'Sign-in was refused. Check the email and app password (a normal password usually will not work).';
  }
  if (e?.code === 'ETIMEDOUT' || e?.code === 'ECONNECTION' || e?.code === 'ESOCKET') {
    return 'Could not reach the mail server. Check the host and port.';
  }
  return e?.message ?? 'Unknown error';
}

export async function testMailbox(mb: MailboxDoc): Promise<{ smtp: string | null; imap: string | null }> {
  let smtpError: string | null = null;
  let imapError: string | null = null;
  try {
    forgetTransporter(String(mb._id));
    await transporterFor(mb).verify();
  } catch (err) {
    smtpError = describe(err);
  }
  if (mb.imap?.host) {
    const client = imapClient(mb);
    try {
      await client.connect();
      await client.logout();
    } catch (err) {
      imapError = describe(err);
    }
  } else {
    imapError = 'Reply detection is off because IMAP is not set up.';
  }
  return { smtp: smtpError, imap: imapError };
}

export { describe as describeMailError };
