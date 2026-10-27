'use client';

import { Mail, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/Modal';
import { MailboxForm } from '@/components/settings/MailboxForm';
import { Badge, Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { plural } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { Mailbox, MailboxTest, Meter, SettingsData, SuppressionEntry } from '@/lib/types';

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 border-t border-line py-10 first:border-t-0 first:pt-0 md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-10">
      <div className="mb-6 md:mb-0">
        <h2 className="font-display text-3xl text-ivory">{title}</h2>
        {description && <p className="mt-2 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function SenderSection({ data, onSaved }: { data: SettingsData; onSaved: () => void }) {
  const [sender, setSender] = useState({
    companyName: data.workspace.sender.companyName ?? '',
    postalAddress: data.workspace.sender.postalAddress ?? '',
    website: data.workspace.sender.website ?? '',
  });
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/settings', { method: 'PATCH', body: { sender } });
      toast.success('Sender details saved.');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <Field label="Business name">
        <Input required value={sender.companyName} maxLength={120} onChange={(e) => setSender({ ...sender, companyName: e.target.value })} />
      </Field>
      <Field label="Postal address" hint="A real address where you receive mail. A PO box or registered office is fine.">
        <textarea
          required
          rows={3}
          maxLength={300}
          value={sender.postalAddress}
          onChange={(e) => setSender({ ...sender, postalAddress: e.target.value })}
          className="w-full rounded-lg border border-line bg-ink p-3 text-base text-ivory outline-none hover:border-brass/50 focus:border-brass md:text-sm"
        />
      </Field>
      <Field label="Website">
        <Input value={sender.website} maxLength={200} placeholder="https://bymsy.com" onChange={(e) => setSender({ ...sender, website: e.target.value })} />
      </Field>
      <Button type="submit" loading={saving}>
        Save sender details
      </Button>
    </form>
  );
}

function testSummary(t: MailboxTest): string {
  if (t.smtp) return `Sending isn't working: ${t.smtp}`;
  if (t.imap) return `Sending works. Reply checking isn't: ${t.imap}`;
  return 'Connected. Sending and reply checking both work.';
}

function InboxesSection() {
  const [mailboxes, setMailboxes] = useState<Mailbox[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Mailbox[]>('/mailboxes').then(setMailboxes).catch((err) => toast.error(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      {mailboxes?.length === 0 && (
        <p className="mb-5 rounded-xl border border-dashed border-line p-5 text-sm text-muted">
          No inboxes yet. Use a separate domain for outreach (for example getbymsy.com), not your main business email, and warm it up for two to three weeks before sending.
        </p>
      )}
      <ul className="space-y-3">
        {mailboxes?.map((m) => (
          <li key={m._id} className="rounded-xl border border-line bg-surface/40 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-brass" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-ivory">{m.email}</span>
                  {m.status === 'active' && <Badge tone="sage">Working</Badge>}
                  {m.status === 'paused' && <Badge>Paused</Badge>}
                  {m.status === 'error' && <Badge tone="coral">Not working</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {m.fromName}, up to {m.dailyLimit} a day
                  {m.imap?.host ? ', replies checked' : ', reply checking off'}
                  {m.imapCheckedAt && ` (last ${new Date(m.imapCheckedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })})`}
                </p>
                {m.lastError && <p className="mt-2 text-sm text-coral">{m.lastError}</p>}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" loading={busy === `t-${m._id}`} disabled={!!busy} onClick={() => run(`t-${m._id}`, async () => {
                const r = await api<{ test: MailboxTest }>(`/mailboxes/${m._id}/test`, { body: {} });
                (r.test.smtp ? toast.error : toast.success)(testSummary(r.test));
              })}>
                Test connection
              </Button>
              <Button size="sm" variant="ghost" loading={busy === `s-${m._id}`} disabled={!!busy} onClick={() => run(`s-${m._id}`, async () => {
                const r = await api<{ sentTo: string }>(`/mailboxes/${m._id}/send-test`, { body: {} });
                toast.success(`Test email sent to ${r.sentTo}.`);
              })}>
                Send me a test
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => run(`p-${m._id}`, async () => {
                await api(`/mailboxes/${m._id}`, { method: 'PATCH', body: { status: m.status === 'paused' ? 'active' : 'paused' } });
              })}>
                {m.status === 'paused' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                {m.status === 'paused' ? 'Resume' : 'Pause'}
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto text-coral hover:text-coral" disabled={!!busy} onClick={() => {
                if (!window.confirm(`Disconnect ${m.email}? Its unsent emails move to your other inboxes.`)) return;
                void run(`d-${m._id}`, async () => {
                  await api(`/mailboxes/${m._id}`, { method: 'DELETE' });
                  toast.success('Inbox disconnected.');
                });
              }}>
                <Trash2 className="h-4 w-4" /> Disconnect
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button className="mt-5" onClick={() => setAdding(true)}>
        <Plus className="h-4 w-4" /> Connect an inbox
      </Button>
      <Modal open={adding} onClose={() => setAdding(false)} title="Connect an inbox" wide>
        <MailboxForm
          onCreated={(_mb, test) => {
            setAdding(false);
            (test.smtp ? toast.error : toast.success)(testSummary(test));
            load();
          }}
        />
      </Modal>
    </div>
  );
}

const REASON: Record<SuppressionEntry['reason'], string> = {
  unsubscribed: 'Unsubscribed',
  bounced: 'Bounced',
  manual: 'Added by you',
  complaint: 'Complaint',
};

function SuppressionSection() {
  const [data, setData] = useState<{ items: SuppressionEntry[]; total: number } | null>(null);
  const [q, setQ] = useState('');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api<{ items: SuppressionEntry[]; total: number }>(`/settings/suppression${q ? `?q=${encodeURIComponent(q)}` : ''}`)
      .then(setData)
      .catch(() => {});
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const add = async () => {
    setSaving(true);
    try {
      const r = await api<{ added: number }>('/settings/suppression', { body: { emails: text } });
      toast.success(r.added ? `Added ${plural(r.added, 'address', 'addresses')}.` : 'No valid email addresses found.');
      setText('');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Field label="Add addresses" hint="One per line, or separated by commas. Anything queued to them is stopped.">
        <textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-lg border border-line bg-ink p-3 text-base text-ivory outline-none hover:border-brass/50 focus:border-brass md:text-sm"
        />
      </Field>
      <Button className="mt-3" variant="secondary" loading={saving} disabled={!text.trim()} onClick={add}>
        Add to list
      </Button>

      <div className="mt-8">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the list" aria-label="Search the do-not-contact list" />
        <p className="mt-3 text-sm text-muted">{plural(data?.total ?? 0, 'address', 'addresses')}</p>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line empty:hidden">
          {data?.items.map((s) => (
            <li key={s._id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate text-ivory">{s.email}</span>
              <Badge tone={s.reason === 'manual' ? 'neutral' : 'coral'}>{REASON[s.reason]}</Badge>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ivory"
                aria-label={`Remove ${s.email}`}
                onClick={async () => {
                  if (s.reason === 'unsubscribed' && !window.confirm('This person unsubscribed. Remove them from the list anyway?')) return;
                  await api(`/settings/suppression/${s._id}`, { method: 'DELETE' }).catch((err) => toast.error(errorMessage(err)));
                  load();
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function UsageRow({ label, meter }: { label: string; meter: Meter }) {
  return (
    <div className="flex justify-between border-b border-line py-2.5 text-sm last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums text-ivory">
        {meter.used.toLocaleString()}
        {meter.limit === null ? ' (unlimited)' : ` of ${meter.limit.toLocaleString()}`}
      </span>
    </div>
  );
}

function AccountSection({ data }: { data: SettingsData }) {
  const { me } = useMe();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api('/auth/password', { body: { current, password } });
      toast.success('Password changed.');
      setCurrent('');
      setPassword('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  const u = data.usage;
  return (
    <div className="grid max-w-3xl gap-10 lg:grid-cols-2">
      <div>
        <p className="text-sm text-muted">Signed in as</p>
        <p className="text-ivory">{me?.user.email}</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <Field label="Current password">
            <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </Field>
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="secondary" loading={saving}>
            Change password
          </Button>
        </form>
      </div>
      <div>
        <p className="mb-2 text-sm text-muted">
          This month on the <span className="text-ivory">{u.plan}</span> plan
        </p>
        <div className="rounded-xl border border-line px-4">
          <UsageRow label="Searches" meter={u.searches} />
          <UsageRow label="Website scans" meter={u.enrichments} />
          <UsageRow label="Email checks" meter={u.verifications} />
          <UsageRow label="AI-written lines" meter={u.aiGenerations} />
          <UsageRow label="Emails sent" meter={u.emails} />
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [data, setData] = useState<SettingsData | null>(null);
  const load = useCallback(() => {
    api<SettingsData>('/settings').then(setData).catch((err) => toast.error(errorMessage(err)));
  }, []);
  useEffect(load, [load]);

  return (
    <div>
      <h1 className="font-display text-5xl leading-none text-ivory md:text-6xl">Settings</h1>
      <div className="mt-12">
        {!data ? (
          <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/40" />
        ) : (
          <>
            <Section id="sender" title="Sender details" description="Printed in the footer of every email. Anti-spam laws in Canada, the US, the UK and the EU require a real business name and postal address.">
              <SenderSection data={data} onSaved={load} />
            </Section>
            <Section id="inboxes" title="Sending inboxes" description="Emails go out from these inboxes, and replies and bounces are read from them so follow-ups stop on their own.">
              <InboxesSection />
            </Section>
            <Section id="do-not-contact" title="Do not contact" description="Never emailed again. Unsubscribes and bounces are added here automatically.">
              <SuppressionSection />
            </Section>
            <Section id="account" title="Account">
              <AccountSection data={data} />
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
