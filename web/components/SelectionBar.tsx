'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { plural } from '@/lib/format';

/** Slides up when something is selected; sits above the mobile tab bar. */
export function SelectionBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center md:bottom-6 md:left-[calc(248px+2.5rem)] md:right-10"
        >
          <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-brass/30 bg-raised/95 p-2 pl-4 shadow-lift backdrop-blur md:w-auto md:max-w-full">
            <span className="mr-1 whitespace-nowrap text-sm font-semibold tabular-nums text-ivory">{plural(count, 'selected', 'selected')}</span>
            <button
              type="button"
              onClick={onClear}
              className="mr-auto grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ivory md:mr-2"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex w-full flex-wrap gap-2 md:w-auto">{children}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
