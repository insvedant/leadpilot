'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ActivityList, OnlineDot, UserActions } from '@/components/admin/bits';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { AdminOverview } from '@/lib/types';

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface/40 px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl tabular-nums ${tone ?? 'text-ivory'}`}>{value.toLocaleString()}</p>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);

  const load = useCallback(() => {
    api<AdminOverview>('/admin/overview')
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (!data) return <div className="h-60 animate-pulse rounded-2xl border border-line bg-surface/40" />;

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-display text-5xl leading-none text-ivory md:text-6xl">Overview</h1>
        <p className="mt-4 text-muted">
          {data.users.total.toLocaleString()} accounts, {data.users.online} online now, {data.users.activeToday} active today. Refreshes every 30 seconds.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium text-muted">Today (UTC)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Searches" value={data.today.searches} />
          <Stat label="Emails sent" value={data.today.emailsSent} />
          <Stat label="Replies" value={data.today.replies} tone="text-sage" />
          <Stat label="Bounces" value={data.today.bounces} tone={data.today.bounces ? 'text-coral' : 'text-ivory'} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-3xl text-ivory">Waiting for approval</h2>
          {data.users.pending > 0 && <span className="text-sm text-muted">{data.users.pending}</span>}
        </div>
        {data.pending.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">Nobody is waiting.</p>
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-brass/30">
            {data.pending.map((u) => (
              <li key={u._id} className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <Link href={`/admin/users/${u._id}`} className="min-w-0 hover:underline">
                  <p className="truncate font-semibold text-ivory">{u.name}</p>
                  <p className="truncate text-sm text-muted">
                    {u.email}, signed up {timeAgo(u.createdAt)}
                  </p>
                </Link>
                <UserActions user={u} onChanged={load} compact />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-12 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-3xl text-ivory">Online now</h2>
          {data.online.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">Nobody has been active in the last 5 minutes.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {data.online.map((u) => (
                <li key={u._id}>
                  <Link href={`/admin/users/${u._id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface/50">
                    <OnlineDot lastSeenAt={u.lastSeenAt} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ivory">{u.name}</span>
                      <span className="block truncate text-xs text-muted">{u.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(u.lastSeenAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-1 font-display text-3xl text-ivory">Watch list</h2>
          <p className="mb-3 text-sm text-muted">Bounce rate above 3% in the last 7 days. At 5%, sending pauses automatically.</p>
          {data.flagged.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-6 py-8 text-center text-sm text-muted">Every account is sending cleanly.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-coral/30">
              {data.flagged.map((f, i) => (
                <li key={f.user?._id ?? i}>
                  <Link href={f.user ? `/admin/users/${f.user._id}` : '/admin/users'} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface/50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ivory">{f.user?.name ?? 'Unknown account'}</span>
                      <span className="block text-xs text-muted">
                        {f.bounced} of {f.sent} bounced
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold tabular-nums ${f.rate > 0.05 ? 'text-coral' : 'text-brass-strong'}`}>{(f.rate * 100).toFixed(1)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-3xl text-ivory">Latest activity</h2>
          <Link href="/admin/activity" className="text-sm font-semibold text-brass-strong hover:underline">
            See all
          </Link>
        </div>
        <ActivityList items={data.recent} />
      </section>
    </div>
  );
}
