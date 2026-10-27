import clsx from 'clsx';
import { BRAND } from '@/lib/brand';

/** The LeadPilot mark: an "L" whose base lifts off into an arrow. Same drawing as app/icon.svg. */
export function Mark({ className, tile = true }: { className?: string; tile?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={clsx('shrink-0', className)} aria-hidden>
      {tile && <rect width="64" height="64" rx="14" fill="#16233A" stroke="#2A3A57" strokeWidth="1.5" />}
      <path d="M21 13 V45 L46 20" fill="none" stroke="#CDAE72" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M33 19 H47 V33" fill="none" stroke="#CDAE72" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <Mark className="h-7 w-7" />
      <span className="font-display text-[1.6rem] leading-none tracking-tight text-ivory">{BRAND.name}</span>
    </span>
  );
}
