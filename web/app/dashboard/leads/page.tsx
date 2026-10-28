'use client';

import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Mail, Send, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ExportMenu } from '@/components/ExportMenu';
import { SelectionBar } from '@/components/SelectionBar';
import { AddToCampaign } from '@/components/leads/AddToCampaign';
import { EnrichBadge } from '@/components/leads/EnrichBadge';
import { LeadDrawer } from '@/components/leads/LeadDrawer';
import { Button, Checkbox, Input, Rating, Select } from '@/components/ui';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { LEAD_STATUS_LABELS } from '@/lib/constants';
import { domainOf, plural } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { Lead, LeadStatus, LeadsPage, LeadsSummary } from '@/lib/types';

interface ListFilters {
  q: string;
  status: string;
  hasEmail: string;
  enrich: string;
  city: string;
  sort: string;
}

const EMPTY: ListFilters = { q: '', status: '', hasEmail: '', enrich: '', city: '', sort: 'recent' };
const PAGE_SIZE = 25;

function toQuery(f: ListFilters, page: number): string {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort: f.sort });
  if (f.q.trim()) params.set('q', f.q.trim());
  if (f.status) params.set('status', f.status);
  if (f.hasEmail) params.set('hasEmail', f.hasEmail);
  if (f.enrich) params.set('enrich', f.enrich);
  if (f.city) params.set('city', f.city);
  return params.toString();
}

function exportFilters(f: ListFilters) {
  return {
    q: f.q.trim() || undefined,
    status: f.status || undefined,
    hasEmail: f.hasEmail || undefined,
    enrich: f.enrich || undefined,
    city: f.city || undefined,
  };
}

export default function LeadsPageView() {
  const { refresh } = useMe();
  const [filters, setFilters] = useState<ListFilters>(EMPTY);
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeadsPage | null>(null);
  const [summary, setSummary] = useState<LeadsSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Lead | null>(null);
  const [busy, setBusy] = useState<null | 'enrich' | 'export' | 'export-all' | 'delete' | 'status' | 'verify'>(null);
  const [addOpen, setAddOpen] = useState(false);
  const firstLoad = useRef(true);

  const effective = useMemo(() => ({ ...filters, q: debouncedQ }), [filters, debouncedQ]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(filters.q), 300);
    return () => clearTimeout(t);
  }, [filters.q]);

  const load = useCallback(
    async (quiet = false) => {
      try {
        const [list, sum] = await Promise.all([
          api<LeadsPage>(`/leads?${toQuery(effective, page)}`),
          api<LeadsSummary>('/leads/summary'),
        ]);
        setData(list);
        setSummary(sum);
        setOpen((current) => (current ? list.items.find((l) => l._id === current._id) ?? current : null));
      } catch (err) {
        if (!quiet) toast.error(errorMessage(err));
      }
    },
    [effective, page],
  );

  useEffect(() => {
    void load(!firstLoad.current);
    firstLoad.current = false;
  }, [load]);

  // While websites are being scanned, refresh every few seconds
  const scanning = (summary?.scanning ?? 0) > 0;
  useEffect(() => {
    if (!scanning) return;
    const t = setInterval(() => void load(true), 3000);
    return () => clearInterval(t);
  }, [scanning, load]);

  const setFilter = (key: keyof ListFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setSelected(new Set());
  };

  const items = data?.items ?? [];
  const allSelected = items.length > 0 && items.every((l) => selected.has(l._id));
  const someSelected = items.some((l) => selected.has(l._id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) items.forEach((l) => next.delete(l._id));
      else items.forEach((l) => next.add(l._id));
      return next;
    });

  const run = async (kind: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const findEmails = () =>
    run('enrich', async () => {
      const res = await api<{ queued: number }>('/leads/enrich', { body: { ids: [...selected] } });
      toast.success(res.queued ? `Scanning ${plural(res.queued, 'website')} for emails.` : 'Those leads are already being scanned.');
      setSelected(new Set());
      void refresh();
      await load(true);
    });

  const verify = () =>
    run('verify', async () => {
      const res = await api<{ queued: number }>('/leads/verify', { body: { ids: [...selected] } });
      toast.success(res.queued ? `Checking ${plural(res.queued, 'email address', 'email addresses')}. Results appear in a minute.` : 'Those addresses are already checked, or the leads have no email.');
      void refresh();
      setTimeout(() => void load(true), 8000);
    });

  const setStatus = (status: LeadStatus) =>
    run('status', async () => {
      const res = await api<{ updated: number }>('/leads/bulk-status', { body: { ids: [...selected], status } });
      toast.success(`Marked ${plural(res.updated, 'lead')} as ${LEAD_STATUS_LABELS[status].toLowerCase()}.`);
      setSelected(new Set());
      await load(true);
    });

  const remove = () => {
    if (!window.confirm(`Delete ${plural(selected.size, 'lead')}? This can't be undone.`)) return;
    void run('delete', async () => {
      const res = await api<{ deleted: number }>('/leads/delete', { body: { ids: [...selected] } });
      toast.success(`Deleted ${plural(res.deleted, 'lead')}.`);
      setSelected(new Set());
      await load(true);
    });
  };

  const exportSelected = (format: 'xlsx' | 'csv') =>
    run('export', async () => {
      await downloadFile('/leads/export', { format, ids: [...selected] }, `leads.${format}`);
      toast.success(`Exported ${plural(selected.size, 'lead')}.`);
    });

  const exportAll = (format: 'xlsx' | 'csv') =>
    run('export-all', async () => {
      await downloadFile('/leads/export', { format, filters: exportFilters(effective) }, `leads.${format}`);
      toast.success(`Exported ${plural(data?.total ?? 0, 'lead')}.`);
    });

  const filtered = Object.entries(filters).some(([k, v]) => k !== 'sort' && v);

  return (
    <div>
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-5xl leading-none text-ivory md:text-6xl">Leads</h1>
          {summary && summary.total > 0 && (
            <p className="mt-4 text-muted">
              {plural(summary.total, 'lead')}, {summary.withEmail.toLocaleString()} with an email
              {summary.scanning > 0 && <span className="text-sky">, {summary.scanning} websites being scanned now</span>}
            </p>
          )}
        </div>
        {(data?.total ?? 0) > 0 && (
          <ExportMenu
            onExport={exportAll}
            busy={busy === 'export-all'}
            label={filtered ? `Export ${plural(data?.total ?? 0, 'match', 'matches')}` : 'Export all'}
          />
        )}
      </div>

      {summary?.total === 0 ? (
        <div className="mt-12 rounded-2xl border border-dashed border-line px-6 py-14 text-center">
          <p className="text-ivory">No leads yet.</p>
          <p className="mt-2 text-sm text-muted">Search for businesses, tick the ones you want and save them here.</p>
          <Link href="/dashboard" className="mt-6 inline-flex h-10 items-center rounded-lg bg-brass px-4 text-sm font-semibold text-ink hover:bg-brass-strong">
            Find leads
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-[1.4fr_repeat(4,1fr)_auto]">
            <Input value={filters.q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Search name, email, address" aria-label="Search leads" className="col-span-2 lg:col-span-1" />
            <Select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Lead status">
              <option value="">Any status</option>
              {Object.entries(LEAD_STATUS_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Select value={filters.hasEmail} onChange={(e) => setFilter('hasEmail', e.target.value)} aria-label="Email">
              <option value="">Any email</option>
              <option value="true">Has an email</option>
              <option value="false">No email yet</option>
            </Select>
            <Select value={filters.enrich} onChange={(e) => setFilter('enrich', e.target.value)} aria-label="Website scan">
              <option value="">Any scan state</option>
              <option value="idle">Not scanned</option>
              <option value="queued">Waiting to scan</option>
              <option value="running">Scanning</option>
              <option value="done">Scanned</option>
              <option value="failed">Scan failed</option>
              <option value="skipped">No website</option>
            </Select>
            <Select value={filters.city} onChange={(e) => setFilter('city', e.target.value)} aria-label="City">
              <option value="">All cities</option>
              {summary?.cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)} aria-label="Sort leads">
              <option value="recent">Newest first</option>
              <option value="rating">Highest rated</option>
              <option value="reviews">Most reviews</option>
              <option value="name">Name A to Z</option>
            </Select>
          </div>

          <div className="mt-6">
            {/* Desktop */}
            <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
              <table className="w-full table-fixed text-sm">
                <thead className="bg-deep text-left text-xs text-muted">
                  <tr>
                    <th className="w-14 px-5 py-3.5">
                      <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} onChange={toggleAll} label="Select all leads on this page" />
                    </th>
                    <th className="px-3 py-3.5 font-medium">Business</th>
                    <th className="w-[26%] px-3 py-3.5 font-medium">Contact</th>
                    <th className="w-32 px-3 py-3.5 font-medium">Rating</th>
                    <th className="w-36 px-3 py-3.5 font-medium">Website scan</th>
                    <th className="w-32 px-3 py-3.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => {
                    const isSel = selected.has(l._id);
                    return (
                      <tr
                        key={l._id}
                        onClick={() => setOpen(l)}
                        className={clsx('cursor-pointer border-t border-line align-top transition-colors', isSel ? 'bg-brass/[0.07]' : 'hover:bg-surface/70')}
                      >
                        <td className="px-5 py-4">
                          <Checkbox checked={isSel} onChange={() => toggle(l._id)} label={`Select ${l.name}`} />
                        </td>
                        <td className="px-3 py-4">
                          <p className="font-semibold text-ivory">{l.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted">{[l.category, l.context?.city].filter(Boolean).join(' in ')}</p>
                        </td>
                        <td className="px-3 py-4">
                          {l.emails[0] ? (
                            <p className="truncate text-ivory">
                              {l.emails[0]}
                              {l.emails.length > 1 && <span className="text-muted"> +{l.emails.length - 1}</span>}
                            </p>
                          ) : (
                            <p className="text-muted">No email yet</p>
                          )}
                          <p className="mt-0.5 flex gap-3 truncate text-xs tabular-nums text-muted">
                            {l.phone && <span>{l.phone}</span>}
                            {l.website && <span className="truncate">{domainOf(l.website)}</span>}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <Rating rating={l.rating} count={l.reviewCount} />
                        </td>
                        <td className="px-3 py-4">
                          <EnrichBadge status={l.enrich?.status} error={l.enrich?.error} emailCount={l.emails.length} />
                        </td>
                        <td className="px-3 py-4 text-ivory">{LEAD_STATUS_LABELS[l.status]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden">
              <div onClick={toggleAll} className="mb-3 flex w-fit cursor-pointer items-center gap-3 px-1 text-sm text-muted">
                <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} onChange={toggleAll} label="Select all leads on this page" />
                {allSelected ? 'Deselect page' : 'Select page'}
              </div>
              <ul className="space-y-2.5">
                {items.map((l) => {
                  const isSel = selected.has(l._id);
                  return (
                    <li
                      key={l._id}
                      onClick={() => setOpen(l)}
                      className={clsx('rounded-xl border p-4', isSel ? 'border-brass/50 bg-brass/[0.07]' : 'border-line bg-surface/50')}
                    >
                      <div className="flex gap-3">
                        <Checkbox checked={isSel} onChange={() => toggle(l._id)} label={`Select ${l.name}`} className="mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold leading-snug text-ivory">{l.name}</p>
                            <span className="shrink-0 text-xs text-muted">{LEAD_STATUS_LABELS[l.status]}</span>
                          </div>
                          <p className="mt-1 flex items-center gap-2 truncate text-sm">
                            <Mail className="h-3.5 w-3.5 shrink-0 text-muted" />
                            <span className={l.emails[0] ? 'truncate text-ivory' : 'text-muted'}>{l.emails[0] ?? 'No email yet'}</span>
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                            <Rating rating={l.rating} count={l.reviewCount} />
                            <EnrichBadge status={l.enrich?.status} error={l.enrich?.error} emailCount={l.emails.length} />
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {data && items.length === 0 && (
              <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">No leads match these filters.</p>
            )}

            {data && data.pages > 1 && (
              <div className="mt-6 flex items-center justify-between text-sm">
                <span className="tabular-nums text-muted">
                  Page {data.page} of {data.pages}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button disabled={!!busy} onClick={() => setAddOpen(true)} className="flex-1 md:flex-none">
          <Send className="h-4 w-4" /> Add to campaign
        </Button>
        <Button variant="secondary" loading={busy === 'enrich'} disabled={!!busy} onClick={findEmails} className="flex-1 md:flex-none">
          Find emails
        </Button>
        <Button variant="secondary" loading={busy === 'verify'} disabled={!!busy} onClick={verify} className="flex-1 md:flex-none">
          {busy !== 'verify' && <ShieldCheck className="h-4 w-4" />}
          Check emails
        </Button>
        <div className="w-40">
          <Select
            value=""
            disabled={!!busy}
            onChange={(e) => e.target.value && setStatus(e.target.value as LeadStatus)}
            aria-label="Mark selected as"
            className="border-line bg-surface"
          >
            <option value="">Mark as</option>
            {Object.entries(LEAD_STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <ExportMenu onExport={exportSelected} busy={busy === 'export'} direction="up" className="flex-1 md:flex-none" />
        <Button variant="danger" loading={busy === 'delete'} disabled={!!busy} onClick={remove} aria-label="Delete selected">
          <Trash2 className="h-4 w-4" />
        </Button>
      </SelectionBar>

      <AddToCampaign
        open={addOpen}
        onClose={() => setAddOpen(false)}
        leadIds={[...selected]}
        onDone={() => {
          setSelected(new Set());
          void load(true);
        }}
      />

      <LeadDrawer
        lead={open}
        onClose={() => setOpen(null)}
        onChanged={(updated) => {
          setOpen(updated);
          setData((d) => d && { ...d, items: d.items.map((l) => (l._id === updated._id ? updated : l)) });
        }}
      />
    </div>
  );
}
