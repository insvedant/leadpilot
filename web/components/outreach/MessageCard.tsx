'use client';

import clsx from 'clsx';
import { AlertTriangle, RefreshCw, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { OutMessage } from '@/lib/types';
import { Badge, Button, Checkbox, Select } from '../ui';
import { MessageStatusBadge, stepLabel } from './labels';

const CHECK_TONE: Record<string, 'sage' | 'coral' | 'neutral' | 'brass'> = {
  ok: 'sage',
  catch_all: 'brass',
  invalid: 'coral',
  disposable: 'coral',
  unknown: 'neutral',
  error: 'neutral',
};
const CHECK_LABEL: Record<string, string> = {
  ok: 'Verified',
  catch_all: 'Accepts all',
  invalid: 'Invalid',
  disposable: 'Disposable',
  unknown: 'Unknown',
  error: 'Check failed',
};

export function EmailCheck({ result }: { result?: string }) {
  if (!result) return null;
  return <Badge tone={CHECK_TONE[result] ?? 'neutral'}>{CHECK_LABEL[result] ?? result}</Badge>;
}

export function MessageCard({
  campaignId,
  message,
  selected,
  onToggle,
  onChanged,
  aiAvailable,
}: {
  campaignId: string;
  message: OutMessage;
  selected: boolean;
  onToggle: () => void;
  onChanged: () => void;
  aiAvailable: boolean;
}) {
  const [subject, setSubject] = useState(message.subject);
  const [body, setBody] = useState(message.body);
  const [toEmail, setToEmail] = useState(message.toEmail);
  const [busy, setBusy] = useState<null | 'save' | 'approve' | 'skip' | 'rewrite' | 'test'>(null);

  // Pick up server changes (e.g. AI line written) unless the user is mid-edit
  const dirty = subject !== message.subject || body !== message.body || toEmail !== message.toEmail;
  useEffect(() => {
    if (!dirty) {
      setSubject(message.subject);
      setBody(message.body);
      setToEmail(message.toEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.subject, message.body, message.toEmail]);

  const writing = message.status === 'pending' || message.status === 'generating';
  const editable = message.status === 'draft';
  const lead = message.lead;
  const check = lead?.emailChecks?.find((c) => c.email === toEmail)?.result;

  const save = async () => {
    await api(`/campaigns/${campaignId}/messages/${message._id}`, { method: 'PATCH', body: { subject, body, toEmail } });
  };

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className={clsx('rounded-2xl border bg-surface/40 transition-colors', selected ? 'border-brass/60' : 'border-line')}>
      <header className="flex flex-wrap items-start gap-3 border-b border-line px-5 py-4">
        {editable && <Checkbox checked={selected} onChange={onToggle} label={`Select email to ${lead?.name ?? toEmail}`} className="mt-0.5" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ivory">{lead?.name ?? 'Deleted lead'}</span>
            <MessageStatusBadge status={message.status} />
            {message.step > 0 && <Badge>{stepLabel(message.step)}</Badge>}
          </div>
          <p className="mt-1 text-xs text-muted">
            {[lead?.category, lead?.context?.city].filter(Boolean).join(' in ')}
            {message.mailbox && <> {lead?.category || lead?.context?.city ? 'from' : 'From'} {message.mailbox.email}</>}
          </p>
        </div>
      </header>

      <div className="space-y-3 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="w-16 shrink-0 text-xs text-muted">To</span>
          <div className="flex flex-1 items-center gap-2">
            {lead && lead.emails.length > 1 && editable ? (
              <div className="flex-1">
                <Select value={toEmail} onChange={(e) => setToEmail(e.target.value)} aria-label="Recipient">
                  {lead.emails.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </Select>
              </div>
            ) : (
              <span className="text-sm text-ivory">{toEmail}</span>
            )}
            <EmailCheck result={check} />
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor={`subj-${message._id}`} className="w-16 shrink-0 text-xs text-muted">
            Subject
          </label>
          <input
            id={`subj-${message._id}`}
            value={subject}
            disabled={!editable}
            onChange={(e) => setSubject(e.target.value)}
            className="h-10 w-full flex-1 rounded-lg border border-line bg-ink px-3 text-base text-ivory outline-none focus:border-brass disabled:opacity-70 md:text-sm"
          />
        </div>
        {writing ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted">
            Claude is writing the personal line for this business
          </div>
        ) : (
          <textarea
            value={body}
            disabled={!editable}
            onChange={(e) => setBody(e.target.value)}
            rows={Math.min(18, Math.max(8, body.split('\n').length + 2))}
            aria-label="Email body"
            className="w-full rounded-lg border border-line bg-ink p-4 font-sans text-base leading-relaxed text-ivory outline-none focus:border-brass disabled:opacity-70 md:text-sm"
          />
        )}
        {message.error && (
          <p className="flex items-start gap-2 text-sm text-coral">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {message.error}
          </p>
        )}
      </div>

      {editable && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
          <Button
            loading={busy === 'approve'}
            disabled={!!busy}
            onClick={() =>
              run('approve', async () => {
                if (dirty) await save();
                await api(`/campaigns/${campaignId}/messages/approve`, { body: { ids: [message._id] } });
                toast.success(`Approved the email to ${lead?.name ?? toEmail}.`);
                onChanged();
              })
            }
          >
            {dirty ? 'Save and approve' : 'Approve'}
          </Button>
          {dirty && (
            <Button
              variant="secondary"
              loading={busy === 'save'}
              disabled={!!busy}
              onClick={() =>
                run('save', async () => {
                  await save();
                  toast.success('Changes saved.');
                  onChanged();
                })
              }
            >
              Save changes
            </Button>
          )}
          {aiAvailable && message.step === 0 && (
            <Button
              variant="ghost"
              loading={busy === 'rewrite'}
              disabled={!!busy}
              onClick={() =>
                run('rewrite', async () => {
                  await api(`/campaigns/${campaignId}/messages/regenerate`, { body: { ids: [message._id] } });
                  onChanged();
                })
              }
            >
              {busy !== 'rewrite' && <RefreshCw className="h-4 w-4" />}
              Rewrite line
            </Button>
          )}
          <Button
            variant="ghost"
            loading={busy === 'test'}
            disabled={!!busy}
            onClick={() =>
              run('test', async () => {
                if (dirty) await save();
                const r = await api<{ sentTo: string }>(`/campaigns/${campaignId}/messages/${message._id}/test`, { body: {} });
                toast.success(`Test sent to ${r.sentTo}.`);
              })
            }
          >
            {busy !== 'test' && <Send className="h-4 w-4" />}
            Send me a test
          </Button>
          <Button
            variant="ghost"
            className="ml-auto text-coral hover:text-coral"
            loading={busy === 'skip'}
            disabled={!!busy}
            onClick={() =>
              run('skip', async () => {
                await api(`/campaigns/${campaignId}/messages/skip`, { body: { ids: [message._id] } });
                toast(`Skipped ${lead?.name ?? toEmail}.`);
                onChanged();
              })
            }
          >
            Skip
          </Button>
        </footer>
      )}
    </article>
  );
}
