'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { plural } from '@/lib/format';
import type { MessagesPage } from '@/lib/types';
import { Button, Checkbox } from '../ui';
import { MessageCard } from './MessageCard';

export function ReviewTab({
  campaignId,
  aiAvailable,
  onCountsChanged,
}: {
  campaignId: string;
  aiAvailable: boolean;
  onCountsChanged: () => void;
}) {
  const [data, setData] = useState<MessagesPage | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | 'approve' | 'approve-all' | 'skip' | 'rewrite'>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<MessagesPage>(`/campaigns/${campaignId}/messages?view=review&page=${page}&limit=10`));
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [campaignId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const writing = data?.items.some((m) => m.status === 'pending' || m.status === 'generating');
  useEffect(() => {
    if (!writing) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [writing, load]);

  const refresh = () => {
    setSelected(new Set());
    void load();
    onCountsChanged();
  };

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const drafts = data?.items.filter((m) => m.status === 'draft') ?? [];
  const allSelected = drafts.length > 0 && drafts.every((m) => selected.has(m._id));

  if (data && data.total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
        <p className="text-ivory">Nothing waiting for review.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Go to Leads, tick the businesses you want to email, and choose Add to campaign. Their drafts appear here for you to check.
        </p>
        <Link href="/dashboard/leads" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brass px-4 text-sm font-semibold text-ink hover:bg-brass-strong">
          Go to leads
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div onClick={() => setSelected(allSelected ? new Set() : new Set(drafts.map((m) => m._id)))} className="flex cursor-pointer items-center gap-3 text-sm text-muted">
          <Checkbox
            checked={allSelected}
            indeterminate={!allSelected && selected.size > 0}
            onChange={() => setSelected(allSelected ? new Set() : new Set(drafts.map((m) => m._id)))}
            label="Select all on this page"
          />
          {selected.size ? plural(selected.size, 'selected', 'selected') : 'Select page'}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {selected.size > 0 ? (
            <>
              <Button variant="ghost" loading={busy === 'skip'} disabled={!!busy} onClick={() => run('skip', async () => {
                const r = await api<{ skipped: number }>(`/campaigns/${campaignId}/messages/skip`, { body: { ids: [...selected] } });
                toast(`Skipped ${plural(r.skipped, 'email')}.`);
              })}>
                Skip
              </Button>
              {aiAvailable && (
                <Button variant="secondary" loading={busy === 'rewrite'} disabled={!!busy} onClick={() => run('rewrite', async () => {
                  const r = await api<{ queued: number }>(`/campaigns/${campaignId}/messages/regenerate`, { body: { ids: [...selected] } });
                  toast(`Rewriting ${plural(r.queued, 'line')}.`);
                })}>
                  Rewrite lines
                </Button>
              )}
              <Button loading={busy === 'approve'} disabled={!!busy} onClick={() => run('approve', async () => {
                const r = await api<{ approved: number }>(`/campaigns/${campaignId}/messages/approve`, { body: { ids: [...selected] } });
                toast.success(`Approved ${plural(r.approved, 'email')}.`);
              })}>
                Approve selected
              </Button>
            </>
          ) : (
            <Button
              loading={busy === 'approve-all'}
              disabled={!!busy || !data?.total}
              onClick={() => {
                if (!window.confirm('Approve every draft in this campaign, including ones on other pages you have not opened?')) return;
                void run('approve-all', async () => {
                  const r = await api<{ approved: number }>(`/campaigns/${campaignId}/messages/approve`, { body: { all: true } });
                  toast.success(`Approved ${plural(r.approved, 'email')}.`);
                });
              }}
            >
              Approve all drafts
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {data?.items.map((m) => (
          <MessageCard
            key={m._id}
            campaignId={campaignId}
            message={m}
            aiAvailable={aiAvailable}
            selected={selected.has(m._id)}
            onToggle={() =>
              setSelected((prev) => {
                const next = new Set(prev);
                if (next.has(m._id)) next.delete(m._id);
                else next.add(m._id);
                return next;
              })
            }
            onChanged={refresh}
          />
        ))}
      </div>

      {data && data.pages > 1 && (
        <div className="mt-6 flex items-center justify-between text-sm">
          <span className="tabular-nums text-muted">
            Page {data.page} of {data.pages}, {plural(data.total, 'email')} to review
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
