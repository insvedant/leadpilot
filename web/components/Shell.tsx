'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import { LogOut, Search, Send, Settings, ShieldCheck, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import type { Meter } from '@/lib/types';
import { Logo } from './Logo';

const NAV = [
  { href: '/dashboard', label: 'Find leads', icon: Search },
  { href: '/dashboard/leads', label: 'Leads', icon: Users },
  { href: '/dashboard/outreach', label: 'Outreach', icon: Send },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

function UsageLine({ label, meter }: { label: string; meter?: Meter }) {
  if (!meter) return null;
  const pct = meter.limit ? Math.min(100, (meter.used / meter.limit) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-ivory">
          {meter.used.toLocaleString()}
          {meter.limit !== null ? ` / ${meter.limit.toLocaleString()}` : ''}
        </span>
      </div>
      {meter.limit !== null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
          <div className={clsx('h-full rounded-full', pct > 90 ? 'bg-coral' : 'bg-brass')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { me } = useMe();

  const signOut = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => null);
    router.replace('/login');
    router.refresh();
  };

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-deep px-4 py-7 md:flex">
        <Link href="/dashboard" className="px-2">
          <Logo />
        </Link>

        <nav className="mt-10 space-y-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                  active ? 'text-ivory' : 'text-muted hover:text-ivory',
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-0 rounded-lg border border-line bg-surface"
                    transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                  />
                )}
                <Icon className={clsx('relative h-4 w-4', active && 'text-brass')} />
                <span className="relative">{label}</span>
              </Link>
            );
          })}
        </nav>

        {me?.user.isAdmin && (
          <Link
            href="/admin"
            className="mt-6 flex h-10 items-center gap-3 rounded-lg border border-brass/30 px-3 text-sm font-medium text-brass-strong transition-colors hover:bg-brass/10"
          >
            <ShieldCheck className="h-4 w-4" />
            Admin
          </Link>
        )}

        <div className="mt-auto space-y-5">
          <div className="space-y-3 rounded-xl border border-line bg-ink p-4">
            <p className="text-xs font-semibold text-ivory">This month</p>
            <UsageLine label="Searches" meter={me?.workspace.usage.searches} />
            <UsageLine label="Website scans" meter={me?.workspace.usage.enrichments} />
            <UsageLine label="Emails sent" meter={me?.workspace.usage.emails} />
          </div>
          <div className="flex items-center gap-3 px-1">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-raised font-display text-lg text-brass-strong">
              {me?.user.name?.[0]?.toUpperCase() ?? ''}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ivory">{me?.user.name ?? ' '}</p>
              <p className="truncate text-xs text-muted">{me?.user.email ?? ' '}</p>
            </div>
            <button onClick={signOut} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ivory" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-ink/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            {me?.user.isAdmin && (
              <Link href="/admin" className="grid h-9 w-9 place-items-center rounded-lg text-brass-strong" aria-label="Admin">
                <ShieldCheck className="h-5 w-5" />
              </Link>
            )}
            <button onClick={signOut} className="grid h-9 w-9 place-items-center rounded-lg text-muted" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-40 pt-6 md:px-10 md:pb-28 md:pt-12">{children}</main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link key={href} href={href} className={clsx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', active ? 'text-brass-strong' : 'text-muted')}>
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
