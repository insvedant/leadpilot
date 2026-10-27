'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { MessagesPage, OutMessage } from '@/lib/types';
import { Button, Segmented } from '../ui';
import { MessageStatusBadge, stepLabel } from './labels';

type View = 'approved' | 'sent' | 'replied' | 'problems';

const fmt = (d?: string) =>
  d ? new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

function when(m: OutMessage, view: View): string {
  if (view === 'replied') return `Replied ${fmt(m.repliedAt)}`;
  if (m.sentAt) return `Sent ${fmt(m.sentAt)}`;
  if (m.scheduledAt && new Date(m.scheduledAt) > new Date()) return `Sends after ${fmt(m.scheduledAt)}`;
  if (m.status === 'approved') return 'Waiting for the next sending slot';
  return '';
}

export function ActivityTab({ campaignId, onCountsChanged }: { campaignId: string; onCountsChanged: () => void }) {
  const [view, setView] = useState<View>('approved');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<MessagesPage | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<MessagesPage>(`/campaigns/${campaignId}/messages?view=${view}&page=${page}&limit=25`));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [campaignId, view, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (view !== 'approved') return;
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [view, load]);

  const act = async (path: string, id: string, message: string) => {
    try {
      await api(`/campaigns/${campaignId}/messages/${path}`, { body: { ids: [id] } });
      toast.success(message);
      void load();
      onCountsChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div>
      <Segmented
        label="Activity view"
        value={view}
        onChange={(v) => {
          setView(v);
          setPage(1);
        }}
        options={[
          { label: 'Queued', value: 'approved' },
          { label: 'Sent', value: 'sent' },
          { label: 'Replied', value: 'replied' },
          { label: 'Problems', value: 'problems' },
        ]}
      />

      <div className="mt-5">
        {data && data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">
            {view === 'approved' && 'Nothing queued. Approved emails wait here until their sending slot.'}
            {view === 'sent' && 'Nothing sent yet. Start the campaign to begin sending approved emails.'}
            {view === 'replied' && 'No replies yet. Replies are checked every few minutes.'}
            {view === 'problems' && 'No failed, skipped or stopped emails.'}
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {data?.items.map((m) => (
              <li key={m._id}>
                <button type="button" onClick={() => setOpen(open === m._id ? null : m._id)} className="w-full px-5 py-4 text-left hover:bg-surface/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ivory">{m.lead?.name ?? m.toEmail}</span>
                    <MessageStatusBadge status={m.status} replied={Boolean(m.repliedAt)} bounced={Boolean(m.bouncedAt)} />
                    <span className="text-xs text-muted">{stepLabel(m.step)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">
                    {m.toEmail}, {m.subject}
                  </p>
                  <p className="mt-1 text-xs text-muted/80">{when(m, view)}</p>
                  {m.error && <p className="mt-1 text-xs text-coral">{m.error}</p>}
                </button>
                {open === m._id && (
                  <div className="border-t border-line bg-deep/60 px-5 py-4">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ivory">{m.body}</pre>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {m.status === 'approved' && m.step === 0 && (
                        <Button size="sm" variant="secondary" onClick={() => act('unapprove', m._id, 'Moved back to review.')}>
                          Move back to review
                        </Button>
                      )}
                      {m.status === 'approved' && (
                        <Button size="sm" variant="ghost" onClick={() => act('skip', m._id, 'Email skipped.')}>
                          Don&apos;t send
                        </Button>
                      )}
                      {(m.status === 'failed' || m.status === 'skipped') && (
                        <Button size="sm" variant="secondary" onClick={() => act('retry', m._id, 'Moved back to review.')}>
                          Review again
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && data.pages > 1 && (
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
