'use client';

import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { History, MapPin, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { ExportMenu } from '@/components/ExportMenu';
import { SelectionBar } from '@/components/SelectionBar';
import { DEFAULT_FILTERS, FilterPanel, countActiveFilters } from '@/components/search/FilterPanel';
import { ResultsList, ResultsSkeleton } from '@/components/search/ResultsList';
import { Button, Field, Input, Select } from '@/components/ui';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { BUSINESS_TYPES, QUICK_TYPES } from '@/lib/constants';
import { plural } from '@/lib/format';
import { useMe } from '@/lib/me';
import type { HistoryItem, Place, SearchFilters, SearchResponse } from '@/lib/types';

type Country = { code: string; name: string; flag: string };
type Region = { code: string; name: string };
type SortKey = 'relevance' | 'rating' | 'reviews' | 'name';

const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

const STORAGE_KEY = 'leadpilot:last-search';

function guessCountry(): string {
  try {
    return new Intl.Locale(navigator.language).maximize().region ?? 'US';
  } catch {
    return 'US';
  }
}

function toRequestBody(f: SearchFilters) {
  const clean = (s: string) => s.trim() || undefined;
  return {
    businessType: f.businessType.trim(),
    keyword: clean(f.keyword),
    countryCode: f.countryCode,
    country: f.country,
    stateCode: clean(f.stateCode),
    state: clean(f.state),
    city: clean(f.city),
    locality: clean(f.locality),
    minRating: f.minRating || undefined,
    minReviews: f.minReviews || undefined,
    openNow: f.openNow || undefined,
    priceLevels: f.priceLevels.length ? f.priceLevels : undefined,
    maxResults: f.maxResults,
    hasWebsite: f.hasWebsite || undefined,
    hasPhone: f.hasPhone || undefined,
    operationalOnly: f.operationalOnly,
    excludeSaved: f.excludeSaved || undefined,
  };
}

export default function FindLeadsPage() {
  const router = useRouter();
  const { refresh } = useMe();

  const [f, setF] = useState<SearchFilters>(DEFAULT_FILTERS);
  const set = <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => setF((prev) => ({ ...prev, [key]: value }));

  const [countries, setCountries] = useState<Country[]>([]);
  const [states, setStates] = useState<Region[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [revealKey, setRevealKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<SortKey>('relevance');
  const [quick, setQuick] = useState('');
  const [busy, setBusy] = useState<null | 'save' | 'enrich' | 'export'>(null);

  // Restore the last search, or default the country from the browser's locale
  useEffect(() => {
    let restored: Partial<SearchFilters> | null = null;
    try {
      restored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    } catch {
      restored = null;
    }
    setF(restored ? { ...DEFAULT_FILTERS, ...restored } : { ...DEFAULT_FILTERS, countryCode: guessCountry() });

    api<Country[]>('/geo/countries')
      .then((v) => setCountries(asArray<Country>(v)))
      .catch(() => toast.error("Couldn't load the country list. Refresh the page to try again."));
    api<HistoryItem[]>('/search/history').then((v) => setHistory(asArray<HistoryItem>(v))).catch(() => {});
  }, []);

  // Fill in the country name once the list arrives
  useEffect(() => {
    if (!countries.length || !f.countryCode || f.country) return;
    const match = countries.find((c) => c.code === f.countryCode);
    if (match) set('country', match.name);
  }, [countries, f.countryCode, f.country]);

  useEffect(() => {
    setStates([]);
    if (!f.countryCode) return;
    api<Region[]>(`/geo/countries/${f.countryCode}/states`).then((v) => setStates(asArray<Region>(v))).catch(() => setStates([]));
  }, [f.countryCode]);

  useEffect(() => {
    setCities([]);
    if (!f.countryCode || !f.stateCode) return;
    api<string[]>(`/geo/countries/${f.countryCode}/states/${f.stateCode}/cities`).then((v) => setCities(asArray<string>(v))).catch(() => setCities([]));
  }, [f.countryCode, f.stateCode]);

  const changeCountry = (code: string) => {
    const c = countries.find((x) => x.code === code);
    setF((prev) => ({ ...prev, countryCode: code, country: c?.name ?? '', stateCode: '', state: '', city: '', locality: '' }));
  };
  const changeState = (code: string) => {
    const s = states.find((x) => x.code === code);
    setF((prev) => ({ ...prev, stateCode: code, state: s?.name ?? '', city: '', locality: '' }));
  };

  const runSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    if (f.businessType.trim().length < 2) return void toast.error('Type what you are looking for, like "vegan bakery" or "roofers".');
    if (!f.countryCode || !f.country) return void toast.error('Choose a country.');

    setLoading(true);
    setSelected(new Set());
    setQuick('');
    setSort('relevance');
    try {
      const res = await api<SearchResponse>('/search', { body: toRequestBody(f) });
      setData(res);
      setRevealKey((k) => k + 1);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
      void refresh();
      api<HistoryItem[]>('/search/history').then((v) => setHistory(asArray<HistoryItem>(v))).catch(() => {});
      if (!res.results.length) toast('No businesses matched. Try a broader area or fewer filters.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const openHistory = async (id: string) => {
    setLoading(true);
    setSelected(new Set());
    try {
      const res = await api<SearchResponse>(`/search/${id}`);
      setData(res);
      setRevealKey((k) => k + 1);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo<Place[]>(() => {
    if (!data) return [];
    const q = quick.trim().toLowerCase();
    const list = q
      ? data.results.filter((p) => [p.name, p.address, p.category].some((v) => v?.toLowerCase().includes(q)))
      : [...data.results];
    if (sort === 'rating') list.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    if (sort === 'reviews') list.sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
    if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [data, quick, sort]);

  const allSelected = visible.length > 0 && visible.every((p) => selected.has(p.placeId));
  const someSelected = visible.some((p) => selected.has(p.placeId));

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
      if (allSelected) visible.forEach((p) => next.delete(p.placeId));
      else visible.forEach((p) => next.add(p.placeId));
      return next;
    });

  const saveSelected = async (enrich: boolean) => {
    if (!data) return null;
    const placeIds = [...selected];
    const res = await api<{ saved: number; leadIds: string[]; queued: number }>('/leads/from-search', {
      body: { searchId: data.searchId, placeIds, enrich },
    });
    setData((d) => d && { ...d, results: d.results.map((p) => (selected.has(p.placeId) ? { ...p, saved: true } : p)) });
    return res;
  };

  const onSave = async (enrich: boolean) => {
    setBusy(enrich ? 'enrich' : 'save');
    try {
      const res = await saveSelected(enrich);
      if (!res) return;
      setSelected(new Set());
      void refresh();
      toast.success(
        enrich && res.queued
          ? `Saved ${plural(res.saved, 'lead')}. Scanning ${plural(res.queued, 'website')} for emails.`
          : `Saved ${plural(res.saved, 'lead')}.`,
        { action: { label: 'View leads', onClick: () => router.push('/dashboard/leads') } },
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const onExport = async (format: 'xlsx' | 'csv') => {
    setBusy('export');
    try {
      const res = await saveSelected(false);
      if (!res) return;
      await downloadFile('/leads/export', { format, ids: res.leadIds }, `leads.${format}`);
      toast.success(`Exported ${plural(res.saved, 'business', 'businesses')}. They're also saved in your leads.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const activeFilters = countActiveFilters(f);

  return (
    <div>
      <form onSubmit={runSearch}>
        {/* Headline echoes the search as you type; the search bar below is where you type it */}
        <h1 className="line-clamp-2 break-words font-display text-[2.4rem] leading-[1.1] text-ivory md:text-[4.25rem]">
          <span className="text-muted">Find </span>
          {f.businessType.trim() || 'businesses'}
          <span className="text-muted"> in </span>
          {f.city.trim() || f.state || f.country || 'your area'}
        </h1>

        <div className="mt-8 flex flex-col rounded-2xl border border-line bg-surface shadow-lift transition-colors focus-within:border-brass/70 md:flex-row md:items-center">
          <label className="flex min-w-0 flex-1 items-center gap-3 px-4 md:px-5" htmlFor="businessType">
            <Search className="h-5 w-5 shrink-0 text-brass" aria-hidden />
            <span className="sr-only">Business or keyword</span>
            <input
              id="businessType"
              type="search"
              list="business-types"
              autoComplete="off"
              enterKeyHint="search"
              maxLength={80}
              value={f.businessType}
              onChange={(e) => set('businessType', e.target.value)}
              placeholder="Any business or keyword, e.g. vegan bakery"
              className="search-input h-14 w-full min-w-0 bg-transparent text-base text-ivory outline-none placeholder:text-muted/70"
            />
            {f.businessType && (
              <button
                type="button"
                onClick={() => set('businessType', '')}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-raised hover:text-ivory"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>
          <div className="mx-4 h-px bg-line md:mx-0 md:h-8 md:w-px" aria-hidden />
          <label className="flex items-center gap-3 px-4 md:w-72 md:px-5" htmlFor="city">
            <MapPin className="h-5 w-5 shrink-0 text-muted" aria-hidden />
            <span className="sr-only">City</span>
            <input
              id="city"
              list="city-options"
              autoComplete="off"
              enterKeyHint="search"
              maxLength={80}
              value={f.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder={f.state ? 'Any city' : 'City'}
              className="search-input h-14 w-full min-w-0 bg-transparent text-base text-ivory outline-none placeholder:text-muted/70"
            />
          </label>
          <div className="p-2">
            <Button type="submit" size="lg" loading={loading} className="w-full md:w-auto">
              {!loading && <Search className="h-4 w-4" />}
              Search
            </Button>
          </div>
        </div>
        <datalist id="business-types">
          {BUSINESS_TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <datalist id="city-options">
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted">Try</span>
          {QUICK_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set('businessType', t)}
              className={clsx(
                'h-8 rounded-full border px-3 text-xs font-medium transition-colors',
                f.businessType.toLowerCase() === t.toLowerCase()
                  ? 'border-brass bg-brass/15 text-brass-strong'
                  : 'border-line text-muted hover:border-brass/50 hover:text-ivory',
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
          <Field label="Country">
            <Select value={f.countryCode} onChange={(e) => changeCountry(e.target.value)} required>
              <option value="" disabled>
                Choose a country
              </option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="State, province or region">
            <Select value={f.stateCode} onChange={(e) => changeState(e.target.value)} disabled={!states.length}>
              <option value="">{states.length ? 'Whole country' : 'Not available'}</option>
              {states.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Neighbourhood or area">
            <Input value={f.locality} maxLength={80} placeholder="Optional, e.g. Downtown" onChange={(e) => set('locality', e.target.value)} />
          </Field>
          <div className="flex items-end sm:col-span-2 lg:col-span-1">
            <Button
              variant="secondary"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className="w-full lg:w-auto"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {activeFilters > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brass px-1 text-[11px] text-ink">{activeFilters}</span>
              )}
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <div className="pt-5">
                <FilterPanel
                  filters={f}
                  set={set}
                  onReset={() =>
                    setF((prev) => ({
                      ...DEFAULT_FILTERS,
                      businessType: prev.businessType,
                      countryCode: prev.countryCode,
                      country: prev.country,
                      stateCode: prev.stateCode,
                      state: prev.state,
                      city: prev.city,
                      locality: prev.locality,
                    }))
                  }
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      <section className="mt-14" aria-live="polite">
        {loading ? (
          <ResultsSkeleton />
        ) : data ? (
          <>
            <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="font-display text-3xl text-ivory">{plural(data.results.length, 'business', 'businesses')}</h2>
                <p className="mt-1 text-sm text-muted">
                  {data.textQuery}
                  {data.filteredOut > 0 && `, ${data.filteredOut} hidden by your filters`}
                </p>
              </div>
              {data.results.length > 0 && (
                <div className="flex gap-2">
                  <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Filter these results" className="md:w-56" aria-label="Filter these results" />
                  <div className="w-40 shrink-0">
                    <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort results">
                      <option value="relevance">Best match</option>
                      <option value="rating">Highest rated</option>
                      <option value="reviews">Most reviews</option>
                      <option value="name">Name A to Z</option>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            {visible.length > 0 ? (
              <ResultsList
                places={visible}
                selected={selected}
                onToggle={toggle}
                allSelected={allSelected}
                someSelected={someSelected}
                onToggleAll={toggleAll}
                revealKey={revealKey}
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-line px-6 py-12 text-center text-muted">
                {data.results.length ? 'Nothing here matches that filter.' : 'No businesses matched. Try a broader area or turn off some filters.'}
              </p>
            )}
            <p className="mt-4 text-right text-xs text-muted/70">Listings from Google Maps</p>
          </>
        ) : (
          <div className="grid gap-8 md:grid-cols-[1fr_1fr]">
            <div className="rounded-2xl border border-dashed border-line p-7">
              <Sparkles className="h-5 w-5 text-brass" />
              <p className="mt-4 text-ivory">Search for any kind of business, in any place.</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Tick the businesses you want, then save them to your leads, scan their websites for emails, or download a spreadsheet.
              </p>
            </div>
            {history.length > 0 && (
              <div>
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-muted">
                  <History className="h-4 w-4" /> Recent searches
                </p>
                <ul className="divide-y divide-line rounded-2xl border border-line">
                  {history.slice(0, 6).map((h) => (
                    <li key={h._id}>
                      <button
                        type="button"
                        onClick={() => openHistory(h._id)}
                        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm hover:bg-surface/60"
                      >
                        <span className="truncate text-ivory">{h.textQuery}</span>
                        <span className="shrink-0 tabular-nums text-muted">{h.count}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <SelectionBar count={selected.size} onClear={() => setSelected(new Set())}>
        <Button variant="secondary" loading={busy === 'save'} disabled={!!busy} onClick={() => onSave(false)} className="flex-1 md:flex-none">
          Save to leads
        </Button>
        <Button loading={busy === 'enrich'} disabled={!!busy} onClick={() => onSave(true)} className="flex-1 md:flex-none">
          Save and find emails
        </Button>
        <ExportMenu onExport={onExport} busy={busy === 'export'} direction="up" className="flex-1 md:flex-none" />
      </SelectionBar>
    </div>
  );
}
