'use client';

import clsx from 'clsx';
import { Ban, CheckCircle2, LogIn, Mail, MailWarning, Reply, Search, Send, Shield, Users } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { ActivityItem, AdminUser, Plan, UserStatus } from '@/lib/types';
import { Badge, Button, Select } from '../ui';

export function UserStatusBadge({ status, isAdmin }: { status: UserStatus; isAdmin?: boolean }) {
  if (isAdmin) return <Badge tone="brass">Admin</Badge>;
  if (status === 'pending') return <Badge tone="brass">Waiting for approval</Badge>;
  if (status === 'suspended') return <Badge tone="coral">Suspended</Badge>;
  if (status === 'rejected') return <Badge>Rejected</Badge>;
  return <Badge tone="sage">Active</Badge>;
}

export function OnlineDot({ lastSeenAt }: { lastSeenAt?: string }) {
  const online = lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 5 * 60 * 1000;
  return (
    <span
      className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', online ? 'bg-sage' : 'bg-line')}
      title={online ? 'Online now' : `Last seen ${timeAgo(lastSeenAt)}`}
      aria-label={online ? 'Online now' : `Last seen ${timeAgo(lastSeenAt)}`}
    />
  );
}

const ICONS: Record<string, typeof Search> = {
  auth: LogIn,
  search: Search,
  leads: Users,
  campaign: Send,
  admin: Shield,
};

function iconFor(type: string) {
  if (type === 'email.replied') return Reply;
  if (type === 'email.bounced') return MailWarning;
  if (type === 'email.sent') return Mail;
  if (type === 'campaign.auto_paused') return Ban;
  if (type === 'admin.approved' || type === 'admin.reactivated') return CheckCircle2;
  return ICONS[type.split('.')[0]] ?? Shield;
}

function toneFor(type: string) {
  if (type === 'email.bounced' || type === 'campaign.auto_paused' || type === 'admin.suspended' || type === 'admin.rejected') return 'text-coral';
  if (type === 'email.replied' || type === 'admin.approved' || type === 'admin.reactivated') return 'text-sage';
  if (type.startsWith('admin')) return 'text-brass';
  return 'text-muted';
}

export function ActivityList({ items, showUser = true }: { items: ActivityItem[]; showUser?: boolean }) {
  if (!items.length) return <p className="rounded-2xl border border-dashed border-line px-6 py-10 text-center text-sm text-muted">No activity yet.</p>;
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
      {items.map((a) => {
        const Icon = iconFor(a.type);
        return (
          <li key={a._id} className="flex gap-3 px-4 py-3">
            <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', toneFor(a.type))} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm text-ivory">{a.summary}</p>
              <p className="mt-0.5 text-xs text-muted">
                {showUser && a.user && (
                  <>
                    <Link href={`/admin/users/${a.user._id}`} className="hover:text-ivory hover:underline">
                      {a.user.name}
                    </Link>
                    {', '}
                  </>
                )}
                <time dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString()}>
                  {timeAgo(a.createdAt)}
                </time>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Approve, reject, suspend and reactivate, with a plan picker for approvals. */
export function UserActions({ user, onChanged, compact }: { user: AdminUser; onChanged: () => void; compact?: boolean }) {
  const [plan, setPlan] = useState<Plan>(user.plan ?? 'free');
  const [busy, setBusy] = useState<string | null>(null);

  if (user.isAdmin) return compact ? null : <p className="text-sm text-muted">Admin accounts are managed through ADMIN_EMAILS.</p>;

  const run = async (action: string, body: Record<string, unknown>, message: string) => {
    setBusy(action);
    try {
      await api(`/admin/users/${user._id}/${action}`, { body });
      toast.success(message);
      onChanged();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const ask = (question: string) => {
    const reason = window.prompt(question);
    return reason === null ? null : reason.trim();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(user.status === 'pending' || user.status === 'rejected' || user.status === 'suspended') && (
        <>
          <div className={compact ? 'w-28' : 'w-32'}>
            <Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)} aria-label="Plan" className="h-8 text-sm">
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="internal">Unlimited</option>
            </Select>
          </div>
          <Button size="sm" loading={busy === 'approve'} disabled={!!busy} onClick={() => run('approve', { plan }, user.status === 'suspended' ? `${user.name} can use LeadPilot again.` : `Approved ${user.name}. They've been emailed.`)}>
            {user.status === 'suspended' ? 'Reactivate' : 'Approve'}
          </Button>
        </>
      )}
      {user.status === 'pending' && (
        <Button
          size="sm"
          variant="ghost"
          disabled={!!busy}
          loading={busy === 'reject'}
          onClick={() => {
            const reason = ask(`Reject ${user.name}? Optional note for your records:`);
            if (reason !== null) void run('reject', { reason: reason || undefined }, `Rejected ${user.name}.`);
          }}
        >
          Reject
        </Button>
      )}
      {user.status === 'active' && (
        <Button
          size="sm"
          variant="danger"
          disabled={!!busy}
          loading={busy === 'suspend'}
          onClick={() => {
            const reason = ask(`Suspend ${user.name}? They'll be signed out and their campaigns paused. Reason (optional):`);
            if (reason !== null) void run('suspend', { reason: reason || undefined }, `Suspended ${user.name}.`);
          }}
        >
          Suspend
        </Button>
      )}
    </div>
  );
}
