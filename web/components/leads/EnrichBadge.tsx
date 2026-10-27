import type { EnrichStatus } from '@/lib/types';
import { Badge, Spinner } from '../ui';

export function EnrichBadge({ status, error, emailCount }: { status?: EnrichStatus; error?: string; emailCount: number }) {
  switch (status) {
    case 'queued':
      return <Badge tone="sky">Waiting to scan</Badge>;
    case 'running':
      return (
        <Badge tone="sky">
          <Spinner className="h-3 w-3" /> Scanning
        </Badge>
      );
    case 'done':
      return emailCount ? <Badge tone="sage">Email found</Badge> : <Badge tone="neutral">No email on site</Badge>;
    case 'failed':
      return (
        <span title={error}>
          <Badge tone="coral">Scan failed</Badge>
        </span>
      );
    case 'skipped':
      return <Badge tone="neutral">No website</Badge>;
    default:
      return <Badge tone="neutral">Not scanned</Badge>;
  }
}
