'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { OnlineDot, UserStatusBadge } from '@/components/admin/bits';
import { Button, Input, Segmented, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { plural, timeAgo } from '@/lib/format';
import type { AdminUser, Paged } from '@/lib/types';

type StatusFilter = '' | 'pending' | 'active' | 'suspended' | 'rejected';
const PLAN_LABEL: Record<string, string> = { free: 'Free', pro: 'Pro', internal: 'Unlimited' };

export default function AdminUsersPage() {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminUser> | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get('status');
    if (s === 'pending' || s === 'active' || s === 'suspended' || s === 'rejected') setStatus(s);
  }, []);

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), sort });
    if (debounced.trim()) params.set('q', debounced.trim());
    if (status) params.set('status', status);
    api<Paged<AdminUser>>(`/admin/users?${params}`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, [page, sort, debounced, status]);

  useEffect(load, [load]);

  return (
    <div>
      <h1 className="font-display text-5xl leading-none text-ivory md:text-6xl">Users</h1>
      <p className="mt-4 text-muted">{data ? plural(data.total, 'account') : ' '}</p>

      <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search name or email" aria-label="Search users" className="lg:w-72" />
        <Segmented
          label="Status"
          value={status}
          onChange={(v) => { setStatus(v); setPage(1); }}
          options={[
            { label: 'All', value: '' },
            { label: 'Waiting', value: 'pending' },
            { label: 'Active', value: 'active' },
            { label: 'Suspended', value: 'suspended' },
            { label: 'Rejected', value: 'rejected' },
          ]}
        />
        <div className="w-44 lg:ml-auto">
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort users">
            <option value="recent">Newest first</option>
            <option value="seen">Recently active</option>
            <option value="name">Name A to Z</option>
          </Select>
        </div>
      </div>

      <div className="mt-6">
        <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-deep text-left text-xs text-muted">
              <tr>
                <th className="px-5 py-3.5 font-medium">User</th>
                <th className="w-44 px-3 py-3.5 font-medium">Status</th>
                <th className="w-24 px-3 py-3.5 font-medium">Plan</th>
                <th className="w-40 px-3 py-3.5 font-medium">This month</th>
                <th className="w-32 px-3 py-3.5 font-medium">Last seen</th>
                <th className="w-28 px-3 py-3.5 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u._id} className="border-t border-line hover:bg-surface/60">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/users/${u._id}`} className="flex items-center gap-3">
                      <OnlineDot lastSeenAt={u.lastSeenAt} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ivory hover:underline">{u.name}</span>
                        <span className="block truncate text-xs text-muted">{u.email}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3.5">
                    <UserStatusBadge status={u.status} isAdmin={u.isAdmin} />
                  </td>
                  <td className="px-3 py-3.5 text-ivory">{PLAN_LABEL[u.plan ?? 'free']}</td>
                  <td className="px-3 py-3.5 text-xs tabular-nums text-muted">
                    {u.usage ? `${u.usage.searches.used} searches, ${u.usage.emails.used} emails` : ''}
                  </td>
                  <td className="px-3 py-3.5 text-muted">{timeAgo(u.lastSeenAt)}</td>
                  <td className="px-3 py-3.5 text-muted">{timeAgo(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="space-y-2.5 md:hidden">
          {data?.items.map((u) => (
            <li key={u._id}>
              <Link href={`/admin/users/${u._id}`} className="block rounded-xl border border-line bg-surface/50 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <OnlineDot lastSeenAt={u.lastSeenAt} />
                    <span className="truncate font-semibold text-ivory">{u.name}</span>
                  </span>
                  <UserStatusBadge status={u.status} isAdmin={u.isAdmin} />
                </div>
                <p className="mt-1 truncate text-sm text-muted">{u.email}</p>
                <p className="mt-2 text-xs text-muted">
                  {PLAN_LABEL[u.plan ?? 'free']} plan, last seen {timeAgo(u.lastSeenAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        {data && data.items.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">No accounts match.</p>
        )}

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
