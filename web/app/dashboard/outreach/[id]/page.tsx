'use client';

import { ArrowLeft, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ActivityTab } from '@/components/outreach/ActivityTab';
import { EmailsTab } from '@/components/outreach/EmailsTab';
import { CampaignStatusBadge, statsLine } from '@/components/outreach/labels';
import { ReviewTab } from '@/components/outreach/ReviewTab';
import { SendingTab } from '@/components/outreach/SendingTab';
import { Tabs } from '@/components/Tabs';
import { Button } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import type { Campaign, Mailbox, SettingsData } from '@/lib/types';

type Tab = 'review' | 'activity' | 'emails' | 'sending';

export default function CampaignPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [tab, setTab] = useState<Tab>('review');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t === 'emails' || t === 'sending' || t === 'activity') setTab(t);
  }, []);

  const loadCampaign = useCallback(async () => {
    try {
      const c = await api<Campaign>(`/campaigns/${id}`);
      setCampaign(c);
      setName((n) => n || c.name);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }, [id]);

  useEffect(() => {
    void loadCampaign();
    api<Mailbox[]>('/mailboxes').then(setMailboxes).catch(() => {});
    api<SettingsData>('/settings').then(setSettings).catch(() => {});
  }, [loadCampaign]);

  useEffect(() => {
    if (campaign?.status !== 'active') return;
    const t = setInterval(() => void loadCampaign(), 20000);
    return () => clearInterval(t);
  }, [campaign?.status, loadCampaign]);

  const rename = async () => {
    if (!campaign || !name.trim() || name.trim() === campaign.name) return setName(campaign?.name ?? '');
    try {
      const res = await api<{ campaign: Campaign }>(`/campaigns/${id}`, { method: 'PATCH', body: { name: name.trim() } });
      setCampaign((c) => c && { ...c, name: res.campaign.name });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const toggle = async () => {
    if (!campaign) return;
    setBusy(true);
    try {
      const action = campaign.status === 'active' ? 'pause' : 'start';
      await api(`/campaigns/${id}/${action}`, { body: {} });
      toast.success(action === 'start' ? 'Campaign started. Approved emails go out during your sending hours.' : 'Campaign paused. Nothing more will send until you start it again.');
      await loadCampaign();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    if (!window.confirm('Archive this campaign? Anything not yet sent will be cancelled.')) return;
    try {
      await api(`/campaigns/${id}/archive`, { body: {} });
      router.push('/dashboard/outreach');
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  if (!campaign) return <div className="h-40 animate-pulse rounded-2xl border border-line bg-surface/40" />;

  const s = campaign.stats;
  return (
    <div>
      <Link href="/dashboard/outreach" className="inline-flex items-center gap-2 text-sm text-muted hover:text-ivory">
        <ArrowLeft className="h-4 w-4" /> Outreach
      </Link>

      <div className="mt-4 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1">
          <label htmlFor="campaign-name" className="sr-only">
            Campaign name
          </label>
          <input
            id="campaign-name"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onBlur={rename}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="w-full truncate border-b border-transparent bg-transparent font-display text-4xl leading-tight text-ivory outline-none hover:border-line focus:border-brass md:text-5xl"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <CampaignStatusBadge status={campaign.status} />
            <span className="text-sm text-muted">{statsLine(s)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={archive}>
            Archive
          </Button>
          <Button variant={campaign.status === 'active' ? 'secondary' : 'primary'} loading={busy} onClick={toggle}>
            {!busy && (campaign.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />)}
            {campaign.status === 'active' ? 'Pause sending' : 'Start sending'}
          </Button>
        </div>
      </div>

      {campaign.pausedReason && (
        <p className="mt-5 rounded-xl border border-coral/40 bg-coral/10 px-4 py-3 text-sm text-coral">Paused automatically: {campaign.pausedReason}</p>
      )}

      <div className="mt-8">
        <Tabs
          id="campaign"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'review', label: 'Review', count: s?.review },
            { value: 'activity', label: 'Activity', count: s?.queued },
            { value: 'emails', label: 'Emails' },
            { value: 'sending', label: 'Sending' },
          ]}
        />
      </div>

      <div className="mt-6">
        {tab === 'review' && (
          <ReviewTab campaignId={campaign._id} aiAvailable={Boolean(settings?.features.ai)} onCountsChanged={() => void loadCampaign()} />
        )}
        {tab === 'activity' && <ActivityTab campaignId={campaign._id} onCountsChanged={() => void loadCampaign()} />}
        {tab === 'emails' && (
          <EmailsTab
            campaign={campaign}
            aiAvailable={Boolean(settings?.features.ai)}
            sender={settings?.workspace.sender ?? {}}
            onSaved={(c) => setCampaign((prev) => prev && { ...prev, ...c })}
          />
        )}
        {tab === 'sending' && (
          <SendingTab
            campaign={campaign}
            mailboxes={mailboxes}
            verificationAvailable={Boolean(settings?.features.verification)}
            onSaved={(c) => setCampaign((prev) => prev && { ...prev, ...c })}
          />
        )}
      </div>
    </div>
  );
}
