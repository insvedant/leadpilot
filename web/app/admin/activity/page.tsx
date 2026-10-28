'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ActivityList } from '@/components/admin/bits';
import { Button, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { plural } from '@/lib/format';
import type { ActivityItem, Paged } from '@/lib/types';

const TYPES = [
  { value: '', label: 'Everything' },
  { value: 'auth', label: 'Sign-ups and sign-ins' },
  { value: 'search', label: 'Searches' },
  { value: 'leads', label: 'Leads' },
  { value: 'campaign', label: 'Campaigns' },
  { value: 'email', label: 'Emails' },
  { value: 'admin', label: 'Admin actions' },
];

export default function AdminActivityPage() {
  const [type, setType] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ActivityItem> | null>(null);

  useEffect(() => {
    setUserId(new URLSearchParams(window.location.search).get('userId'));
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page) });
    if (type) params.set('type', type);
    if (userId) params.set('userId', userId);
    api<Paged<ActivityItem>>(`/admin/activity?${params}`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, [type, userId, page]);

  useEffect(() => {
    load();
    if (page !== 1) return;
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load, page]);

  return (
    <div>
      <h1 className="font-display text-5xl leading-none text-ivory md:text-6xl">Activity</h1>
      <p className="mt-4 text-muted">Everything people do in LeadPilot, newest first. Kept for 180 days.</p>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="Type of activity">
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </div>
        {userId && (
          <Link href="/admin/activity" onClick={() => setUserId(null)} className="text-sm font-semibold text-brass-strong hover:underline">
            Show all users
          </Link>
        )}
        {data && <span className="ml-auto text-sm text-muted">{plural(data.total, 'event')}</span>}
      </div>

      <div className="mt-6">
        {data ? <ActivityList items={data.items} /> : <div className="h-60 animate-pulse rounded-2xl border border-line bg-surface/40" />}
        {data && data.pages > 1 && (
          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="tabular-nums text-muted">
              Page {data.page} of {data.pages}
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
    </div>
  );
}
