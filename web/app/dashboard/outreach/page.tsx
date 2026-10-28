'use client';

import { CheckCircle2, Circle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CampaignStatusBadge, statsLine } from '@/components/outreach/labels';
import { Button } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { Campaign, Mailbox, SettingsData } from '@/lib/types';

export default function OutreachPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([api<Campaign[]>('/campaigns'), api<Mailbox[]>('/mailboxes'), api<SettingsData>('/settings')])
      .then(([c, m, s]) => {
        setCampaigns(c);
        setMailboxes(m);
        setSettings(s);
      })
      .catch((err) => toast.error(errorMessage(err)));
  }, []);

  const create = async () => {
    setCreating(true);
    try {
      const c = await api<Campaign>('/campaigns', {
        body: { name: 'New campaign', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      });
      router.push(`/dashboard/outreach/${c._id}?tab=emails`);
    } catch (err) {
      toast.error(errorMessage(err));
      setCreating(false);
    }
  };

  const senderReady = Boolean(settings?.workspace.sender.companyName && settings?.workspace.sender.postalAddress);
  const inboxReady = mailboxes.some((m) => m.status === 'active');

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-5xl leading-none text-ivory md:text-6xl">Outreach</h1>
          <p className="mt-4 max-w-xl text-muted">
            Write one email, let Claude add a line about each business, review every draft, then send from your own inboxes at a safe pace.
          </p>
        </div>
        <Button onClick={create} loading={creating}>
          {!creating && <Plus className="h-4 w-4" />}
          New campaign
        </Button>
      </div>

      {settings && (!senderReady || !inboxReady) && (
        <div className="mt-10 rounded-2xl border border-brass/30 bg-brass/[0.06] p-6">
          <p className="font-semibold text-ivory">Before your first send</p>
          <ol className="mt-4 space-y-3 text-sm">
            <li className="flex items-start gap-3">
              {inboxReady ? <CheckCircle2 className="h-5 w-5 shrink-0 text-sage" /> : <Circle className="h-5 w-5 shrink-0 text-muted" />}
              <span className={inboxReady ? 'text-muted line-through' : 'text-ivory'}>
                Connect a sending inbox.{' '}
                {!inboxReady && (
                  <Link href="/dashboard/settings#inboxes" className="font-semibold text-brass-strong hover:underline">
                    Connect one
                  </Link>
                )}
              </span>
            </li>
            <li className="flex items-start gap-3">
              {senderReady ? <CheckCircle2 className="h-5 w-5 shrink-0 text-sage" /> : <Circle className="h-5 w-5 shrink-0 text-muted" />}
              <span className={senderReady ? 'text-muted line-through' : 'text-ivory'}>
                Add your business name and postal address. They go in every email footer, which anti-spam laws require.{' '}
                {!senderReady && (
                  <Link href="/dashboard/settings#sender" className="font-semibold text-brass-strong hover:underline">
                    Add them
                  </Link>
                )}
              </span>
            </li>
          </ol>
        </div>
      )}

      <div className="mt-10">
        {campaigns === null ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border border-line bg-surface/40" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line px-6 py-14 text-center">
            <p className="text-ivory">No campaigns yet.</p>
            <p className="mt-2 text-sm text-muted">Create one, then add leads to it from the Leads page.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
            {campaigns.map((c) => (
              <li key={c._id}>
                <Link href={`/dashboard/outreach/${c._id}`} className="flex flex-col gap-2 px-5 py-5 transition-colors hover:bg-surface/60 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="truncate font-semibold text-ivory">{c.name}</span>
                      <CampaignStatusBadge status={c.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted">{statsLine(c.stats)}</p>
                  </div>
                  {c.pausedReason && <p className="text-sm text-coral md:max-w-xs md:text-right">{c.pausedReason}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
