import { Lead } from '../models/Lead';
import { env } from '../config/env';
import { enrichWebsite } from './enrich';

/**
 * Small in-process job queue. Good for a single server. When you scale to
 * multiple instances, swap this for BullMQ + Redis; the push() interface stays the same.
 */
export class InProcessQueue {
  private running = 0;
  private tasks: (() => Promise<void>)[] = [];

  constructor(private concurrency: number) {}

  push(task: () => Promise<void>): void {
    this.tasks.push(task);
    this.drain();
  }

  get size(): number {
    return this.tasks.length + this.running;
  }

  private drain(): void {
    while (this.running < this.concurrency && this.tasks.length) {
      const task = this.tasks.shift()!;
      this.running++;
      task()
        .catch((err) => console.error('Queue task failed', err))
        .finally(() => {
          this.running--;
          this.drain();
        });
    }
  }
}

const enrichQueue = new InProcessQueue(env.ENRICH_CONCURRENCY);

async function runEnrichment(leadId: string): Promise<void> {
  const lead = await Lead.findById(leadId);
  if (!lead) return;

  if (!lead.website) {
    lead.set('enrich', { status: 'skipped', error: 'No website listed on Google', at: new Date() });
    await lead.save();
    return;
  }

  lead.set('enrich.status', 'running');
  await lead.save();

  try {
    const result = await enrichWebsite(lead.website);
    const merged = new Set([...(lead.emails ?? []), ...result.emails]);
    lead.emails = [...merged].slice(0, 10);
    const socials = { ...(lead.socials ?? {}), ...result.socials };
    lead.set('socials', socials);
    lead.set('enrich', { status: 'done', pagesScanned: result.pagesScanned, at: new Date(), error: undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Website scan failed';
    lead.set('enrich', { status: 'failed', error: message.slice(0, 200), at: new Date() });
  }
  await lead.save();
}

export function queueEnrichment(leadIds: string[]): void {
  for (const id of leadIds) enrichQueue.push(() => runEnrichment(id));
}

/** Leads that were mid-scan when the server stopped get picked up again on boot. */
export async function resumeInterruptedEnrichment(): Promise<void> {
  const stuck = await Lead.find({ 'enrich.status': { $in: ['queued', 'running'] } }, { _id: 1 }).lean();
  if (stuck.length) {
    console.log(`Resuming ${stuck.length} interrupted website scans`);
    queueEnrichment(stuck.map((l) => String(l._id)));
  }
}
