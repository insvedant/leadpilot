'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { Campaign, Mailbox } from '@/lib/types';
import { Badge, Button, Checkbox, Field, Input, Select, Switch } from '../ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hourLabel = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

function timezones(current: string): string[] {
  let list: string[] = [];
  try {
    list = (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    list = ['UTC', 'America/Toronto', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Asia/Kolkata', 'Australia/Sydney'];
  }
  return list.includes(current) ? list : [current, ...list];
}

export function SendingTab({
  campaign,
  mailboxes,
  verificationAvailable,
  onSaved,
}: {
  campaign: Campaign;
  mailboxes: Mailbox[];
  verificationAvailable: boolean;
  onSaved: (c: Campaign) => void;
}) {
  const [mailboxIds, setMailboxIds] = useState<string[]>(campaign.mailboxIds);
  const [schedule, setSchedule] = useState(campaign.schedule);
  const [requireVerified, setRequireVerified] = useState(campaign.requireVerified);
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => timezones(schedule.timezone), [schedule.timezone]);

  const perDay = mailboxes.filter((m) => mailboxIds.includes(m._id)).reduce((sum, m) => sum + m.dailyLimit, 0);

  const save = async () => {
    setSaving(true);
    try {
      const res = await api<{ campaign: Campaign }>(`/campaigns/${campaign._id}`, {
        method: 'PATCH',
        body: { mailboxIds, schedule, requireVerified },
      });
      onSaved(res.campaign);
      toast.success('Sending settings saved.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h3 className="font-display text-2xl text-ivory">Send from</h3>
        <p className="mt-1 text-sm text-muted">Leads are spread evenly across the inboxes you tick. Each one stays with the same inbox for its follow-ups.</p>
        {mailboxes.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-muted">
            No inboxes connected.{' '}
            <Link href="/dashboard/settings#inboxes" className="font-semibold text-brass-strong hover:underline">
              Connect one in Settings
            </Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {mailboxes.map((m) => {
              const on = mailboxIds.includes(m._id);
              return (
                <li key={m._id}>
                  <div
                    onClick={() => setMailboxIds((ids) => (on ? ids.filter((x) => x !== m._id) : [...ids, m._id]))}
                    className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-surface/50"
                  >
                    <Checkbox checked={on} onChange={() => setMailboxIds((ids) => (on ? ids.filter((x) => x !== m._id) : [...ids, m._id]))} label={m.email} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ivory">{m.email}</span>
                      <span className="block text-xs text-muted">
                        {m.fromName}, up to {m.dailyLimit} a day
                      </span>
                    </span>
                    {m.status !== 'active' && <Badge tone={m.status === 'error' ? 'coral' : 'neutral'}>{m.status === 'error' ? 'Not working' : 'Paused'}</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {perDay > 0 && <p className="mt-2 text-xs text-muted">Up to {perDay} emails a day across the selected inboxes.</p>}
      </section>

      <section>
        <h3 className="font-display text-2xl text-ivory">When to send</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Field label="Timezone (use your recipients')">
              <Select value={schedule.timezone} onChange={(e) => setSchedule({ ...schedule, timezone: e.target.value })}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="From">
            <Select value={schedule.startHour} onChange={(e) => setSchedule({ ...schedule, startHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Until">
            <Select value={schedule.endHour} onChange={(e) => setSchedule({ ...schedule, endHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                <option key={h} value={h}>
                  {hourLabel(h)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-medium text-muted">Days</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d, i) => {
              const on = schedule.days.includes(i);
              return (
                <button
                  key={d}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSchedule({ ...schedule, days: on ? schedule.days.filter((x) => x !== i) : [...schedule.days, i].sort() })}
                  className={clsx(
                    'h-9 w-12 rounded-lg border text-xs font-semibold transition-colors',
                    on ? 'border-brass bg-brass/15 text-brass-strong' : 'border-line text-muted hover:text-ivory',
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Shortest gap between emails (minutes)">
            <Input
              type="number"
              min={1}
              max={60}
              value={Math.round(schedule.minGapSec / 60)}
              onChange={(e) => setSchedule({ ...schedule, minGapSec: Math.max(1, Number(e.target.value) || 1) * 60 })}
            />
          </Field>
          <Field label="Longest gap between emails (minutes)">
            <Input
              type="number"
              min={1}
              max={60}
              value={Math.round(schedule.maxGapSec / 60)}
              onChange={(e) => setSchedule({ ...schedule, maxGapSec: Math.max(1, Number(e.target.value) || 1) * 60 })}
            />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">Each inbox waits a random time in this range between emails, so the sending pattern looks human.</p>
      </section>

      <section className="divide-y divide-line">
        <Switch
          checked={requireVerified}
          onChange={setRequireVerified}
          label="Only email addresses that passed verification"
          hint={
            verificationAvailable
              ? 'Leads without a verified address are left out when you add them. Addresses found invalid are always left out.'
              : 'Add MILLIONVERIFIER_API_KEY to the server to verify addresses.'
          }
        />
      </section>

      <div className="flex justify-end">
        <Button size="lg" loading={saving} onClick={save}>
          Save sending settings
        </Button>
      </div>
    </div>
  );
}
