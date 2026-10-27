'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/Logo';
import { Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api('/auth/forgot', { body: { email } });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-12 block w-fit">
          <Logo />
        </Link>
        <h1 className="font-display text-5xl leading-none text-ivory">Reset your password</h1>
        {sent ? (
          <p className="mt-6 leading-relaxed text-muted">
            If an account exists for <span className="text-ivory">{email}</span>, a reset link is on its way. It works for one hour.
          </p>
        ) : (
          <form onSubmit={submit} className="mt-10 space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            {error && <p role="alert" className="rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
            <Button type="submit" size="lg" loading={loading} className="w-full">
              Send reset link
            </Button>
          </form>
        )}
        <p className="mt-8 text-sm text-muted">
          <Link href="/login" className="font-semibold text-brass-strong hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
