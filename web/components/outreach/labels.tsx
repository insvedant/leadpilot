import type { Campaign, MessageStatus } from '@/lib/types';
import { Badge, Spinner } from '../ui';

export function CampaignStatusBadge({ status }: { status: Campaign['status'] }) {
  if (status === 'active') return <Badge tone="sage">Sending</Badge>;
  if (status === 'paused') return <Badge tone="brass">Paused</Badge>;
  if (status === 'archived') return <Badge>Archived</Badge>;
  return <Badge>Not started</Badge>;
}

export function MessageStatusBadge({ status, replied, bounced }: { status: MessageStatus; replied?: boolean; bounced?: boolean }) {
  if (replied) return <Badge tone="sage">Replied</Badge>;
  if (bounced) return <Badge tone="coral">Bounced</Badge>;
  switch (status) {
    case 'pending':
    case 'generating':
      return (
        <Badge tone="sky">
          <Spinner className="h-3 w-3" /> Writing
        </Badge>
      );
    case 'draft':
      return <Badge tone="brass">Needs review</Badge>;
    case 'approved':
      return <Badge tone="sky">Approved</Badge>;
    case 'sending':
      return <Badge tone="sky">Sending</Badge>;
    case 'sent':
      return <Badge tone="sage">Sent</Badge>;
    case 'failed':
      return <Badge tone="coral">Failed</Badge>;
    case 'skipped':
      return <Badge>Skipped</Badge>;
    default:
      return <Badge>Stopped</Badge>;
  }
}

export function stepLabel(step: number) {
  return step === 0 ? 'First email' : `Follow-up ${step}`;
}

export function statsLine(s: Campaign['stats']): string {
  if (!s || !s.leads) return 'No leads added yet';
  const parts = [
    s.review && `${s.review} to review`,
    s.queued && `${s.queued} queued`,
    `${s.sent} sent`,
    s.replied && `${s.replied} replied`,
    s.bounced && `${s.bounced} bounced`,
  ].filter(Boolean);
  return parts.join(', ');
}
