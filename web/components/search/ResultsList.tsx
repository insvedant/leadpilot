'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import { Globe, MapPin, Phone } from 'lucide-react';
import { domainOf } from '@/lib/format';
import type { Place } from '@/lib/types';
import { Badge, Checkbox, Rating } from '../ui';

const stop = (e: React.MouseEvent) => e.stopPropagation();

export function ResultsList({
  places,
  selected,
  onToggle,
  allSelected,
  someSelected,
  onToggleAll,
  revealKey,
}: {
  places: Place[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  allSelected: boolean;
  someSelected: boolean;
  onToggleAll: () => void;
  revealKey: number;
}) {
  const delay = (i: number) => ({ delay: Math.min(i, 18) * 0.03, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const });

  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-2xl border border-line md:block">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-deep text-left text-xs text-muted">
            <tr>
              <th className="w-14 px-5 py-3.5">
                <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} onChange={onToggleAll} label="Select all results" />
              </th>
              <th className="px-3 py-3.5 font-medium">Business</th>
              <th className="w-36 px-3 py-3.5 font-medium">Rating</th>
              <th className="w-40 px-3 py-3.5 font-medium">Phone</th>
              <th className="w-48 px-3 py-3.5 font-medium">Website</th>
              <th className="px-3 py-3.5 font-medium">Address</th>
            </tr>
          </thead>
          <tbody key={revealKey}>
            {places.map((p, i) => {
              const isSel = selected.has(p.placeId);
              return (
                <motion.tr
                  key={p.placeId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={delay(i)}
                  onClick={() => onToggle(p.placeId)}
                  className={clsx('cursor-pointer border-t border-line align-top transition-colors', isSel ? 'bg-brass/[0.07]' : 'hover:bg-surface/70')}
                >
                  <td className="px-5 py-4">
                    <Checkbox checked={isSel} onChange={() => onToggle(p.placeId)} label={`Select ${p.name}`} />
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex items-start gap-2">
                      <span className="font-semibold text-ivory">{p.name}</span>
                      {p.saved && <Badge tone="sage">Saved</Badge>}
                    </div>
                    {p.category && <p className="mt-0.5 text-xs text-muted">{p.category}</p>}
                  </td>
                  <td className="px-3 py-4">
                    <Rating rating={p.rating} count={p.reviewCount} />
                  </td>
                  <td className="px-3 py-4 tabular-nums">
                    {p.phone ? (
                      <a href={`tel:${p.intlPhone ?? p.phone}`} onClick={stop} className="text-ivory hover:text-brass-strong">
                        {p.phone}
                      </a>
                    ) : (
                      <span className="text-muted">None listed</span>
                    )}
                  </td>
                  <td className="truncate px-3 py-4">
                    {p.website ? (
                      <a href={p.website} target="_blank" rel="noopener noreferrer" onClick={stop} className="text-sky hover:underline">
                        {domainOf(p.website)}
                      </a>
                    ) : (
                      <span className="text-muted">None listed</span>
                    )}
                  </td>
                  <td className="px-3 py-4 text-muted">{p.address}</td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden">
        <div onClick={onToggleAll} className="mb-3 flex w-fit cursor-pointer items-center gap-3 px-1 text-sm text-muted">
          <Checkbox checked={allSelected} indeterminate={!allSelected && someSelected} onChange={onToggleAll} label="Select all results" />
          {allSelected ? 'Deselect all' : 'Select all'}
        </div>
        <ul key={revealKey} className="space-y-2.5">
          {places.map((p, i) => {
            const isSel = selected.has(p.placeId);
            return (
              <motion.li
                key={p.placeId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={delay(i)}
                onClick={() => onToggle(p.placeId)}
                className={clsx(
                  'rounded-xl border p-4 transition-colors',
                  isSel ? 'border-brass/50 bg-brass/[0.07]' : 'border-line bg-surface/50',
                )}
              >
                <div className="flex gap-3">
                  <Checkbox checked={isSel} onChange={() => onToggle(p.placeId)} label={`Select ${p.name}`} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold leading-snug text-ivory">{p.name}</p>
                      {p.saved && <Badge tone="sage">Saved</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {p.category && <span>{p.category}</span>}
                      <Rating rating={p.rating} count={p.reviewCount} />
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm">
                      {p.phone && (
                        <a href={`tel:${p.intlPhone ?? p.phone}`} onClick={stop} className="flex items-center gap-2 tabular-nums text-ivory">
                          <Phone className="h-3.5 w-3.5 text-muted" />
                          {p.phone}
                        </a>
                      )}
                      {p.website && (
                        <a href={p.website} target="_blank" rel="noopener noreferrer" onClick={stop} className="flex items-center gap-2 text-sky">
                          <Globe className="h-3.5 w-3.5 text-muted" />
                          <span className="truncate">{domainOf(p.website)}</span>
                        </a>
                      )}
                      {p.address && (
                        <p className="flex gap-2 text-muted">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {p.address}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="space-y-2.5" aria-busy="true" aria-label="Loading results">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-xl border border-line bg-surface/40" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  );
}
