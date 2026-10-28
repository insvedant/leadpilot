'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { Logo, Mark } from '@/components/Logo';
import { BRAND } from '@/lib/brand';

export default function Landing() {
  return (
    <div className="flex min-h-dvh flex-col px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))] md:px-12">
      <header className="flex items-center justify-between">
        <Logo />
        <Link href="/login" className="text-sm font-semibold text-muted hover:text-ivory">
          Sign in
        </Link>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center py-16">
        <motion.div
          initial={{ x: -14, y: 14, opacity: 0 }}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 w-fit"
        >
          <Mark className="h-14 w-14" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="font-display text-[3.2rem] leading-[0.95] tracking-tight text-ivory md:text-[6.5rem]"
        >
          {BRAND.tagline}
        </motion.h1>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }}>
          <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted">
            Name a trade and a place. {BRAND.name} lists every matching business, finds the emails they publish,
            drafts a personal email to each one for you to approve, and sends from your own inbox.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/register" className="inline-flex h-12 items-center rounded-lg bg-brass px-6 font-semibold text-ink transition-colors hover:bg-brass-strong">
              Create an account
            </Link>
            <Link href="/login" className="inline-flex h-12 items-center rounded-lg border border-line px-6 font-semibold text-ivory transition-colors hover:border-brass/60">
              Sign in
            </Link>
          </div>
        </motion.div>
      </main>

      <footer className="text-xs text-muted">
        © {new Date().getFullYear()} {BRAND.name}
      </footer>
    </div>
  );
}
