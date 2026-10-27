'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { plural } from '@/lib/format';
import type { AddLeadsResult, Campaign } from '@/lib/types';
import { Modal } from '../Modal';
import { CampaignStatusBadge } from '../outreach/labels';
import { Button } from '../ui';

function summary(r: AddLeadsResult): string {
  const skipped = [
    r.alreadyAdded && `${r.alreadyAdded} already in it`,
    r.noEmail && `${r.noEmail} with no usable email`,
    r.unverified && `${r.unverified} not verified`,
    r.doNotContact && `${r.doNotContact} on do-not-contact`,
  ].filter(Boolean);
  return `Added ${plural(r.added, 'lead')}.${skipped.length ? ` Left out: ${skipped.join(', ')}.` : ''}${
    r.aiQueued ? ' Claude is writing their personal lines now.' : ''
  }`;
}

export function AddToCampaign({ open, onClose, leadIds, onDone }: { open: boolean; onClose: () => void; leadIds: string[]; onDone: () => void }) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api<Campaign[]>('/campaigns').then(setCampaigns).catch((err) => toast.error(errorMessage(err)));
  }, [open]);

  const add = async (campaignId: string) => {
    setBusy(campaignId);
    try {
      const r = await api<AddLeadsResult>(`/campaigns/${campaignId}/leads`, { body: { leadIds } });
      toast.success(summary(r), {
        duration: 8000,
        action: r.added ? { label: 'Review drafts', onClick: () => router.push(`/dashboard/outreach/${campaignId}`) } : undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const createAndAdd = async () => {
    setBusy('new');
    try {
      const c = await api<Campaign>('/campaigns', { body: { name: 'New campaign', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } });
      await add(c._id);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add ${plural(leadIds.length, 'lead')} to a campaign`}>
      <p className="text-sm leading-relaxed text-muted">
        Each lead with an email gets a draft for you to review. Nothing sends until you approve it and start the campaign.
      </p>
      <ul className="mt-5 space-y-2">
        {campaigns?.map((c) => (
          <li key={c._id}>
            <button
              type="button"
              disabled={!!busy}
              onClick={() => add(c._id)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-brass/60 disabled:opacity-50"
            >
              <span className="truncate text-ivory">{c.name}</span>
              <CampaignStatusBadge status={c.status} />
            </button>
          </li>
        ))}
      </ul>
      {campaigns?.length === 0 && <p className="mt-4 text-sm text-muted">You don&apos;t have a campaign yet.</p>}
      <Button className="mt-5 w-full" variant={campaigns?.length ? 'secondary' : 'primary'} loading={busy === 'new'} disabled={!!busy} onClick={createAndAdd}>
        {busy !== 'new' && <Plus className="h-4 w-4" />}
        Create a new campaign with these leads
      </Button>
    </Modal>
  );
}
