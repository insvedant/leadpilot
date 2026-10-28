'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ActivityList, OnlineDot, UserActions, UserStatusBadge } from '@/components/admin/bits';
import { CampaignStatusBadge, MessageStatusBadge, statsLine, stepLabel } from '@/components/outreach/labels';
import { Tabs } from '@/components/Tabs';
import { Badge, Button, Segmented, Select } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { dateTime, plural, timeAgo } from '@/lib/format';
import type { ActivityItem, AdminEmail, AdminUserDetail, Campaign, Meter, Paged, Plan } from '@/lib/types';

type Tab = 'activity' | 'searches' | 'emails' | 'campaigns' | 'inboxes';

function MeterRow({ label, meter }: { label: string; meter: Meter }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line py-2 text-sm last:border-b-0">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums text-ivory">
        {meter.used.toLocaleString()}
        {meter.limit === null ? '' : ` / ${meter.limit.toLocaleString()}`}
      </span>
    </div>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2 text-sm">
      <span className="mr-auto tabular-nums text-muted">
        Page {page} of {pages}
      </span>
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </Button>
      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </div>
  );
}

function ActivityTab({ userId, type }: { userId: string; type?: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ActivityItem> | null>(null);
  useEffect(() => {
    const params = new URLSearchParams({ userId, page: String(page) });
    if (type) params.set('type', type);
    api<Paged<ActivityItem>>(`/admin/activity?${params}`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, [userId, type, page]);
  if (!data) return <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/40" />;
  return (
    <>
      <ActivityList items={data.items} showUser={false} />
      <Pager page={data.page} pages={data.pages} onPage={setPage} />
    </>
  );
}

function SearchesTab({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<ActivityItem> | null>(null);
  useEffect(() => {
    api<Paged<ActivityItem>>(`/admin/activity?userId=${userId}&type=search&page=${page}`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, [userId, page]);
  if (!data) return <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/40" />;
  if (!data.items.length) return <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">No searches yet.</p>;
  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-deep text-left text-xs text-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Looking for</th>
              <th className="px-3 py-3 font-medium">Where</th>
              <th className="w-24 px-3 py-3 font-medium">Results</th>
              <th className="w-36 px-3 py-3 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((a) => {
              const m = (a.meta ?? {}) as Record<string, string | number | undefined>;
              return (
                <tr key={a._id} className="border-t border-line">
                  <td className="px-4 py-3 text-ivory">{[m.keyword, m.businessType].filter(Boolean).join(' ') || a.summary}</td>
                  <td className="px-3 py-3 text-muted">{[m.city, m.state, m.country].filter(Boolean).join(', ')}</td>
                  <td className="px-3 py-3 tabular-nums text-ivory">{m.results ?? ''}</td>
                  <td className="px-3 py-3 text-muted">{dateTime(a.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pager page={data.page} pages={data.pages} onPage={setPage} />
    </>
  );
}

type EmailView = 'sent' | 'replied' | 'bounced' | 'queued';

function EmailsTab({ userId }: { userId: string }) {
  const [view, setView] = useState<EmailView>('sent');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [data, setData] = useState<Paged<AdminEmail> | null>(null);
  useEffect(() => {
    setData(null);
    api<Paged<AdminEmail>>(`/admin/users/${userId}/emails?view=${view}&page=${page}`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, [userId, view, page]);

  return (
    <div>
      <Segmented
        label="Emails"
        value={view}
        onChange={(v) => {
          setView(v);
          setPage(1);
        }}
        options={[
          { label: 'Sent', value: 'sent' },
          { label: 'Replied', value: 'replied' },
          { label: 'Bounced', value: 'bounced' },
          { label: 'Not sent yet', value: 'queued' },
        ]}
      />
      <div className="mt-4">
        {!data ? (
          <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/40" />
        ) : data.items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">Nothing here.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {data.items.map((m) => (
              <li key={m._id}>
                <button type="button" onClick={() => setOpen(open === m._id ? null : m._id)} className="w-full px-4 py-3 text-left hover:bg-surface/50">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-ivory">
                      {m.mailbox?.email ?? 'Unknown inbox'} <span className="text-muted">to</span> {m.toEmail}
                    </span>
                    <MessageStatusBadge status={m.status} replied={Boolean(m.repliedAt)} bounced={Boolean(m.bouncedAt)} />
                  </div>
                  <p className="mt-1 truncate text-sm text-muted">
                    {m.lead?.name ? `${m.lead.name}: ` : ''}
                    {m.subject}
                  </p>
                  <p className="mt-1 text-xs text-muted/80">
                    {[m.campaign?.name, stepLabel(m.step), m.sentAt ? `sent ${dateTime(m.sentAt)}` : `created ${dateTime(m.createdAt)}`]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                </button>
                {open === m._id && (
                  <div className="border-t border-line bg-deep/60 px-4 py-4">
                    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-ivory">{m.body}</pre>
                    {m.error && <p className="mt-3 text-sm text-coral">{m.error}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </div>
    </div>
  );
}

function CampaignsTab({ userId }: { userId: string }) {
  const [data, setData] = useState<Campaign[] | null>(null);
  useEffect(() => {
    api<Campaign[]>(`/admin/users/${userId}/campaigns`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, [userId]);
  if (!data) return <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/40" />;
  if (!data.length) return <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">No campaigns yet.</p>;
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line">
      {data.map((c) => (
        <li key={c._id} className="px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ivory">{c.name}</span>
            <CampaignStatusBadge status={c.status} />
          </div>
          <p className="mt-1 text-sm text-muted">{statsLine(c.stats)}</p>
          {c.pausedReason && <p className="mt-1 text-sm text-coral">{c.pausedReason}</p>}
        </li>
      ))}
    </ul>
  );
}

export default function AdminUserPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [tab, setTab] = useState<Tab>('activity');
  const [planBusy, setPlanBusy] = useState(false);

  const load = useCallback(() => {
    api<AdminUserDetail>(`/admin/users/${id}`)
      .then(setData)
      .catch((err) => toast.error(errorMessage(err)));
  }, [id]);
  useEffect(load, [load]);

  if (!data) return <div className="h-60 animate-pulse rounded-2xl border border-line bg-surface/40" />;
  const { user, workspace, totals, bounce7 } = data;

  const changePlan = async (plan: Plan) => {
    setPlanBusy(true);
    try {
      await api(`/admin/users/${user._id}/plan`, { body: { plan } });
      toast.success('Plan updated.');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setPlanBusy(false);
    }
  };

  const override = async (days: number) => {
    try {
      await api(`/admin/users/${user._id}/bounce-override`, { body: { days } });
      toast.success(days ? `They can send for ${days} days despite bounces.` : 'Bounce protection is back on.');
      load();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const overrideActive = workspace?.bounceOverrideUntil && new Date(workspace.bounceOverrideUntil) > new Date();
  const bouncePct = bounce7.sent ? (bounce7.rate * 100).toFixed(1) : '0';

  return (
    <div>
      <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ivory">
        <ArrowLeft className="h-4 w-4" /> Users
      </Link>

      <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="break-words font-display text-4xl leading-tight text-ivory md:text-5xl">{user.name}</h1>
            <UserStatusBadge status={user.status} isAdmin={user.isAdmin} />
          </div>
          <p className="mt-2 break-all text-muted">{user.email}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <OnlineDot lastSeenAt={user.lastSeenAt} />
            Last seen {timeAgo(user.lastSeenAt)}, joined {timeAgo(user.createdAt)}
            {user.statusReason && <span className="text-coral">. Note: {user.statusReason}</span>}
          </p>
        </div>
        <UserActions user={{ ...user, plan: workspace?.plan }} onChanged={load} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-line bg-surface/40 p-5">
          <h2 className="text-sm font-semibold text-ivory">Totals</h2>
          <div className="mt-3">
            <MeterRow label="Leads saved" meter={{ used: totals.leads, limit: null }} />
            <MeterRow label="Leads with email" meter={{ used: totals.leadsWithEmail, limit: null }} />
            <MeterRow label="Campaigns" meter={{ used: totals.campaigns, limit: null }} />
            <MeterRow label="Emails sent" meter={{ used: totals.sent, limit: null }} />
            <MeterRow label="Replies" meter={{ used: totals.replied, limit: null }} />
            <MeterRow label="Bounces" meter={{ used: totals.bounced, limit: null }} />
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-surface/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-ivory">This month</h2>
            {workspace && !user.isAdmin && (
              <div className="w-32">
                <Select value={workspace.plan} disabled={planBusy} onChange={(e) => changePlan(e.target.value as Plan)} aria-label="Plan" className="h-8 text-sm">
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="internal">Unlimited</option>
                </Select>
              </div>
            )}
          </div>
          {workspace && (
            <div className="mt-3">
              <MeterRow label="Searches" meter={workspace.usage.searches} />
              <MeterRow label="Website scans" meter={workspace.usage.enrichments} />
              <MeterRow label="Email checks" meter={workspace.usage.verifications} />
              <MeterRow label="AI lines" meter={workspace.usage.aiGenerations} />
              <MeterRow label="Emails" meter={workspace.usage.emails} />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-surface/40 p-5">
          <h2 className="text-sm font-semibold text-ivory">Sending health (7 days)</h2>
          <p className={`mt-3 font-display text-4xl tabular-nums ${bounce7.rate > 0.05 ? 'text-coral' : bounce7.rate > 0.03 ? 'text-brass-strong' : 'text-sage'}`}>{bouncePct}%</p>
          <p className="text-sm text-muted">
            bounced, {bounce7.bounced} of {plural(bounce7.sent, 'email')}
          </p>
          {overrideActive ? (
            <div className="mt-4">
              <Badge tone="brass">Protection off until {dateTime(workspace!.bounceOverrideUntil)}</Badge>
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => override(0)}>
                Turn protection back on
              </Button>
            </div>
          ) : (
            bounce7.rate > 0.05 && (
              <Button size="sm" variant="secondary" className="mt-4" onClick={() => override(3)}>
                Let them send for 3 days anyway
              </Button>
            )
          )}
          {workspace?.sender.companyName && (
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
              Sends as {workspace.sender.companyName}
              {workspace.sender.website ? `, ${workspace.sender.website}` : ''}
            </p>
          )}
        </section>
      </div>

      <div className="mt-10">
        <Tabs
          id="admin-user"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'activity', label: 'Activity' },
            { value: 'searches', label: 'Searches' },
            { value: 'emails', label: 'Emails', count: totals.sent },
            { value: 'campaigns', label: 'Campaigns', count: totals.campaigns },
            { value: 'inboxes', label: 'Inboxes', count: data.mailboxes.length },
          ]}
        />
      </div>
      <div className="mt-6">
        {tab === 'activity' && <ActivityTab userId={user._id} />}
        {tab === 'searches' && <SearchesTab userId={user._id} />}
        {tab === 'emails' && <EmailsTab userId={user._id} />}
        {tab === 'campaigns' && <CampaignsTab userId={user._id} />}
        {tab === 'inboxes' &&
          (data.mailboxes.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">No inboxes connected.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {data.mailboxes.map((m) => (
                <li key={m._id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ivory">{m.email}</span>
                    <Badge tone={m.status === 'active' ? 'sage' : m.status === 'error' ? 'coral' : 'neutral'}>
                      {m.status === 'active' ? 'Working' : m.status === 'error' ? 'Not working' : 'Paused'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {m.fromName}, {m.provider}, up to {m.dailyLimit} a day{m.lastSentAt ? `, last sent ${timeAgo(m.lastSentAt)}` : ''}
                  </p>
                  {m.lastError && <p className="mt-1 text-xs text-coral">{m.lastError}</p>}
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
