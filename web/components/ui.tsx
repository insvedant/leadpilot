'use client';

import clsx from 'clsx';
import { Check, ChevronDown, Minus, Star } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        {
          'bg-brass text-ink hover:bg-brass-strong': variant === 'primary',
          'border border-line bg-surface text-ivory hover:border-brass/60': variant === 'secondary',
          'text-muted hover:bg-surface hover:text-ivory': variant === 'ghost',
          'border border-coral/40 text-coral hover:bg-coral/10': variant === 'danger',
          'h-8 px-3 text-xs': size === 'sm',
          'h-10 px-4 text-sm': size === 'md',
          'h-12 px-6 text-base': size === 'lg',
        },
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={clsx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (value: boolean) => void;
  label: string;
  className?: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={clsx(
        'grid h-5 w-5 shrink-0 place-items-center rounded-[5px] border transition-colors',
        on ? 'border-brass bg-brass text-ink' : 'border-line bg-ink hover:border-brass/70',
        className,
      )}
    >
      {indeterminate ? (
        <Minus className="h-3.5 w-3.5" strokeWidth={3} />
      ) : checked ? (
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      ) : null}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span>
        <span className="block text-sm text-ivory">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative mt-0.5 h-6 w-10 shrink-0 rounded-full transition-colors',
          checked ? 'bg-brass' : 'bg-line',
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-5 w-5 rounded-full bg-ivory shadow transition-transform',
            checked ? 'translate-x-[18px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-0.5 rounded-lg border border-line bg-ink p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'h-8 rounded-md px-3 text-xs font-semibold tabular-nums transition-colors',
            value === o.value ? 'bg-raised text-brass-strong' : 'text-muted hover:text-ivory',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={clsx(
          'h-10 w-full appearance-none rounded-lg border border-line bg-ink pl-3 pr-9 text-base text-ivory md:text-sm outline-none transition-colors hover:border-brass/50 focus:border-brass disabled:opacity-50',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
    </div>
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={clsx(
        'h-10 w-full rounded-lg border border-line bg-ink px-3 text-base text-ivory md:text-sm outline-none transition-colors placeholder:text-muted/70 hover:border-brass/50 focus:border-brass',
        className,
      )}
      {...rest}
    />
  );
});

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted/80">{hint}</span>}
    </label>
  );
}

const TONES = {
  neutral: 'border-line text-muted',
  brass: 'border-brass/40 text-brass-strong',
  sage: 'border-sage/40 text-sage',
  coral: 'border-coral/40 text-coral',
  sky: 'border-sky/40 text-sky',
};

export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold', TONES[tone])}>
      {children}
    </span>
  );
}

export function Rating({ rating, count }: { rating?: number; count?: number }) {
  if (rating === undefined) return <span className="text-muted">No rating</span>;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Star className="h-3.5 w-3.5 fill-brass text-brass" aria-hidden />
      <span className="text-ivory">{rating.toFixed(1)}</span>
      {count !== undefined && <span className="text-muted">({count.toLocaleString()})</span>}
    </span>
  );
}
