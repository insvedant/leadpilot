'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  id,
}: {
  tabs: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  id: string;
}) {
  return (
    <div role="tablist" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={clsx(
              'relative flex h-11 shrink-0 items-center gap-2 px-3 text-sm font-medium transition-colors',
              active ? 'text-ivory' : 'text-muted hover:text-ivory',
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={clsx('rounded-full px-1.5 text-[11px] tabular-nums', active ? 'bg-brass text-ink' : 'bg-raised text-muted')}>
                {t.count}
              </span>
            )}
            {active && <motion.span layoutId={`tab-${id}`} className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brass" />}
          </button>
        );
      })}
    </div>
  );
}
