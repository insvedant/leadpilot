'use client';

import clsx from 'clsx';
import { PRICE_OPTIONS } from '@/lib/constants';
import type { PriceLevel, SearchFilters } from '@/lib/types';
import { Button, Field, Input, Segmented, Switch } from '../ui';

export const DEFAULT_FILTERS: SearchFilters = {
  businessType: '',
  keyword: '',
  countryCode: '',
  country: '',
  stateCode: '',
  state: '',
  city: '',
  locality: '',
  minRating: 0,
  minReviews: 0,
  openNow: false,
  priceLevels: [],
  maxResults: 20,
  hasWebsite: false,
  hasPhone: false,
  operationalOnly: true,
  excludeSaved: false,
};

export function countActiveFilters(f: SearchFilters): number {
  return [
    f.keyword.trim(),
    f.minRating > 0,
    f.minReviews > 0,
    f.openNow,
    f.priceLevels.length > 0,
    f.maxResults !== 20,
    f.hasWebsite,
    f.hasPhone,
    !f.operationalOnly,
    f.excludeSaved,
  ].filter(Boolean).length;
}

export function FilterPanel({
  filters: f,
  set,
  onReset,
}: {
  filters: SearchFilters;
  set: <K extends keyof SearchFilters>(key: K, value: SearchFilters[K]) => void;
  onReset: () => void;
}) {
  const togglePrice = (p: PriceLevel) =>
    set('priceLevels', f.priceLevels.includes(p) ? f.priceLevels.filter((x) => x !== p) : [...f.priceLevels, p]);

  return (
    <div className="grid gap-8 rounded-2xl border border-line bg-surface/60 p-5 md:grid-cols-[1.2fr_1fr] md:p-7">
      <div className="space-y-6">
        <Field label="Narrow by keyword" hint='Added to the search, for example "pediatric" or "vegan"'>
          <Input value={f.keyword} maxLength={80} placeholder="Optional" onChange={(e) => set('keyword', e.target.value)} />
        </Field>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Minimum Google rating</p>
          <Segmented
            label="Minimum Google rating"
            value={f.minRating}
            onChange={(v) => set('minRating', v)}
            options={[
              { label: 'Any', value: 0 },
              { label: '3.5+', value: 3.5 },
              { label: '4.0+', value: 4 },
              { label: '4.5+', value: 4.5 },
            ]}
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Minimum number of reviews</p>
          <Segmented
            label="Minimum number of reviews"
            value={f.minReviews}
            onChange={(v) => set('minReviews', v)}
            options={[
              { label: 'Any', value: 0 },
              { label: '10+', value: 10 },
              { label: '50+', value: 50 },
              { label: '100+', value: 100 },
              { label: '500+', value: 500 },
            ]}
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Price level</p>
          <div className="flex flex-wrap gap-2">
            {PRICE_OPTIONS.map((p) => (
              <button
                key={p.value}
                type="button"
                aria-pressed={f.priceLevels.includes(p.value)}
                onClick={() => togglePrice(p.value)}
                className={clsx(
                  'h-8 min-w-12 rounded-md border px-3 text-xs font-semibold tabular-nums transition-colors',
                  f.priceLevels.includes(p.value) ? 'border-brass bg-brass/15 text-brass-strong' : 'border-line text-muted hover:text-ivory',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted/80">Mostly applies to restaurants, bars and shops</p>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">How many results to fetch</p>
          <Segmented
            label="How many results to fetch"
            value={f.maxResults}
            onChange={(v) => set('maxResults', v)}
            options={[
              { label: '20', value: 20 },
              { label: '40', value: 40 },
              { label: '60', value: 60 },
            ]}
          />
          <p className="mt-1 text-xs text-muted/80">Google returns at most 60 per search. For more, search smaller areas.</p>
        </div>
      </div>

      <div className="divide-y divide-line">
        <Switch checked={f.hasWebsite} onChange={(v) => set('hasWebsite', v)} label="Has a website" hint="Needed to find an email" />
        <Switch checked={f.hasPhone} onChange={(v) => set('hasPhone', v)} label="Has a phone number" />
        <Switch checked={f.openNow} onChange={(v) => set('openNow', v)} label="Open right now" />
        <Switch
          checked={f.operationalOnly}
          onChange={(v) => set('operationalOnly', v)}
          label="Only operating businesses"
          hint="Hides places marked closed"
        />
        <Switch checked={f.excludeSaved} onChange={(v) => set('excludeSaved', v)} label="Hide businesses already in leads" />
        <div className="pt-4">
          <Button variant="ghost" size="sm" onClick={onReset}>
            Reset filters
          </Button>
        </div>
      </div>
    </div>
  );
}
