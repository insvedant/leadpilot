'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from './ui';

export function ExportMenu({
  onExport,
  label = 'Export',
  busy,
  variant = 'secondary',
  align = 'right',
  direction = 'down',
  className,
}: {
  onExport: (format: 'xlsx' | 'csv') => void;
  label?: string;
  busy?: boolean;
  variant?: 'primary' | 'secondary';
  align?: 'left' | 'right';
  direction?: 'up' | 'down';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const pick = (format: 'xlsx' | 'csv') => {
    setOpen(false);
    onExport(format);
  };

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <Button variant={variant} loading={busy} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu" className="w-full">
        {!busy && <Download className="h-4 w-4" />}
        {label}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: direction === 'up' ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === 'up' ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className={`absolute z-50 w-52 rounded-xl border border-line bg-raised p-1.5 shadow-lift ${
              align === 'right' ? 'right-0' : 'left-0'
            } ${direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            <button role="menuitem" type="button" onClick={() => pick('xlsx')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ivory hover:bg-surface">
              <FileSpreadsheet className="h-4 w-4 text-sage" />
              Excel workbook (.xlsx)
            </button>
            <button role="menuitem" type="button" onClick={() => pick('csv')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-ivory hover:bg-surface">
              <FileText className="h-4 w-4 text-sky" />
              CSV file (.csv)
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
