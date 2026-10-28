'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ArrowLeft, Activity, LayoutGrid, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { useMe } from '@/lib/me';
import type { AdminOverview } from '@/lib/types';
import { Logo } from '../Logo';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutGrid },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/activity', label: 'Activity', icon: Activity },
];

const isActive = (pathname: string, href: string) => (href === '/admin' ? pathname === href : pathname.startsWith(href));

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { me } = useMe();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!me?.user.isAdmin) return;
    const load = () =>
      api<AdminOverview>('/admin/overview')
        .then((o) => setPendingCount(o.users.pending))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [me?.user.isAdmin, pathname]);

  if (!me) return <div className="min-h-dvh" />;
  if (!me.user.isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="font-display text-5xl text-ivory">Page not found</p>
        <Link href="/dashboard" className="text-sm font-semibold text-brass-strong hover:underline">
          Go to your dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-deep px-4 py-7 md:flex">
        <Link href="/admin" className="px-2">
          <Logo />
        </Link>
        <p className="mt-2 px-2 text-xs font-semibold text-brass">Admin</p>
        <nav className="mt-8 space-y-1" aria-label="Admin">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link key={href} href={href} className={clsx('relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium', active ? 'text-ivory' : 'text-muted hover:text-ivory')}>
                {active && <motion.span layoutId="admin-nav" className="absolute inset-0 rounded-lg border border-line bg-surface" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
                <Icon className={clsx('relative h-4 w-4', active && 'text-brass')} />
                <span className="relative">{label}</span>
                {label === 'Users' && pendingCount > 0 && (
                  <span className="relative ml-auto rounded-full bg-brass px-1.5 text-[11px] font-semibold tabular-nums text-ink">{pendingCount}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <Link href="/dashboard" className="mt-auto flex items-center gap-2 px-3 text-sm text-muted hover:text-ivory">
          <ArrowLeft className="h-4 w-4" /> Back to the app
        </Link>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-ink/95 pt-[env(safe-area-inset-top)] backdrop-blur md:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <span className="flex items-center gap-2">
              <Logo />
              <span className="text-xs font-semibold text-brass">Admin</span>
            </span>
            <Link href="/dashboard" className="grid h-9 w-9 place-items-center rounded-lg text-muted" aria-label="Back to the app">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Admin">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={clsx('flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm', isActive(pathname, href) ? 'bg-surface text-ivory' : 'text-muted')}
              >
                {label}
                {label === 'Users' && pendingCount > 0 && <span className="rounded-full bg-brass px-1.5 text-[11px] font-semibold text-ink">{pendingCount}</span>}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-20 pt-6 md:px-10 md:pt-12">{children}</main>
      </div>
    </div>
  );
}
