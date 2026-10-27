'use client';

import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { MailProvider, Mailbox, MailboxTest } from '@/lib/types';
import { Button, Field, Input, Select, Switch } from '../ui';

const PROVIDERS: { value: MailProvider; label: string; help: string }[] = [
  {
    value: 'gmail',
    label: 'Gmail or Google Workspace',
    help: 'Turn on 2-Step Verification for this account, then create an app password at myaccount.google.com/apppasswords and paste the 16 characters here. Your normal password will not work.',
  },
  { value: 'zoho', label: 'Zoho Mail (.com)', help: 'In Zoho: My Account, Security, App Passwords. Generate one for "LeadPilot" and paste it here. IMAP access must be on in Zoho Mail settings.' },
  { value: 'zoho_in', label: 'Zoho Mail India (.in)', help: 'For accounts on zoho.in. Generate an app password under My Account, Security, App Passwords, and turn on IMAP access in Mail settings.' },
  {
    value: 'outlook',
    label: 'Outlook or Microsoft 365',
    help: 'Your admin must allow "Authenticated SMTP" for this mailbox. Use an app password if the account has multi-factor sign-in.',
  },
  { value: 'custom', label: 'Other provider', help: 'Enter the SMTP and IMAP details from your email provider.' },
];

export function MailboxForm({ onCreated }: { onCreated: (mb: Mailbox, test: MailboxTest) => void }) {
  const [provider, setProvider] = useState<MailProvider>('gmail');
  const [fromName, setFromName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dailyLimit, setDailyLimit] = useState(30);
  const [smtp, setSmtp] = useState({ host: '', port: 465, secure: true });
  const [imap, setImap] = useState({ host: '', port: 993, secure: true });
  const [useImap, setUseImap] = useState(true);
  const [saving, setSaving] = useState(false);

  const info = PROVIDERS.find((p) => p.value === provider)!;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = { provider, fromName, email, password: password.replace(/\s+/g, ''), dailyLimit };
      if (provider === 'custom') {
        body.smtp = smtp;
        body.imap = useImap ? imap : null;
      }
      const res = await api<{ mailbox: Mailbox; test: MailboxTest }>('/mailboxes', { body });
      onCreated(res.mailbox, res.test);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Email provider">
        <Select value={provider} onChange={(e) => setProvider(e.target.value as MailProvider)}>
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <p className="rounded-lg border border-line bg-surface/50 p-3 text-sm leading-relaxed text-muted">{info.help}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name people will see">
          <Input required value={fromName} maxLength={80} placeholder="Micro from Bymsy" onChange={(e) => setFromName(e.target.value)} />
        </Field>
        <Field label="Email address">
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </div>
      <Field label="App password">
        <Input required type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Most emails per day" hint="Start at 20 to 30 for a new inbox and raise it slowly after a few weeks of warm-up.">
        <Input type="number" min={1} max={200} value={dailyLimit} onChange={(e) => setDailyLimit(Math.max(1, Math.min(200, Number(e.target.value) || 1)))} className="w-28" />
      </Field>

      {provider === 'custom' && (
        <div className="space-y-4 rounded-xl border border-line p-4">
          <p className="text-sm font-semibold text-ivory">Sending server (SMTP)</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
            <Input required placeholder="smtp.example.com" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} aria-label="SMTP host" />
            <Input required type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value), secure: Number(e.target.value) === 465 })} aria-label="SMTP port" />
          </div>
          <p className="text-xs text-muted">Port 465 uses SSL; 587 uses STARTTLS.</p>
          <Switch checked={useImap} onChange={setUseImap} label="Check this inbox for replies and bounces (IMAP)" hint="Strongly recommended. Without it, follow-ups can't stop when someone replies." />
          {useImap && (
            <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
              <Input required placeholder="imap.example.com" value={imap.host} onChange={(e) => setImap({ ...imap, host: e.target.value })} aria-label="IMAP host" />
              <Input required type="number" value={imap.port} onChange={(e) => setImap({ ...imap, port: Number(e.target.value), secure: Number(e.target.value) === 993 })} aria-label="IMAP port" />
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted">Your app password is encrypted before it's stored, and never shown again.</p>
      <Button type="submit" size="lg" loading={saving} className="w-full">
        Connect and test
      </Button>
    </form>
  );
}
