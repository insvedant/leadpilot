'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Logo } from '@/components/Logo';
import { Button, Field, Input } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

export default function ResetPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') ?? '');
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api<{ signedIn?: boolean; message?: string }>('/auth/reset', { body: { token, password } });
      if (res.signedIn === false) {
        setError(`Password saved. ${res.message ?? ''}`.trim());
        setLoading(false);
        return;
      }
      router.replace('/dashboard');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-12 block w-fit">
          <Logo />
        </Link>
        <h1 className="font-display text-5xl leading-none text-ivory">Choose a new password</h1>
        <form onSubmit={submit} className="mt-10 space-y-4">
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p role="alert" className="rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">{error}</p>}
          <Button type="submit" size="lg" loading={loading} disabled={!token} className="w-full">
            Save password and sign in
          </Button>
          {!token && <p className="text-sm text-coral">This page needs the link from your reset email.</p>}
        </form>
      </div>
    </div>
  );
}
