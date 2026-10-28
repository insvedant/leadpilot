'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, errorMessage } from '@/lib/api';
import { Logo } from './Logo';
import { Button, Field, Input } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const isRegister = mode === 'register';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api<{ pending?: boolean }>(`/auth/${mode}`, { body: isRegister ? form : { email: form.email, password: form.password } });
      if (res?.pending) {
        setPending(true);
        setLoading(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next');
      router.replace(next?.startsWith('/dashboard') ? next : '/dashboard');
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  if (pending) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-12 block w-fit">
            <Logo />
          </Link>
          <h1 className="font-display text-5xl leading-none text-ivory">Thanks, {form.name.split(' ')[0]}</h1>
          <p className="mt-6 leading-relaxed text-muted">
            Your account is waiting for approval. We&apos;ll email <span className="text-ivory">{form.email}</span> as soon as it&apos;s ready, usually within a day.
          </p>
          <Link href="/" className="mt-10 inline-block text-sm font-semibold text-brass-strong hover:underline">
            Back to the home page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-12 block w-fit">
          <Logo />
        </Link>
        <h1 className="font-display text-5xl leading-none text-ivory">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-3 text-sm text-muted">
          {isRegister ? 'Free to start. No card needed.' : 'Sign in to your workspace.'}
        </p>

        <form onSubmit={submit} className="mt-10 space-y-4">
          {isRegister && (
            <Field label="Your name">
              <Input autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          )}
          <Field label="Email">
            <Input type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label="Password" hint={isRegister ? 'At least 8 characters' : undefined}>
            <Input
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              minLength={isRegister ? 8 : 1}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          {!isRegister && (
            <Link href="/forgot" className="block text-right text-sm text-muted hover:text-ivory">
              Forgot your password?
            </Link>
          )}
          {error && (
            <p role="alert" className="rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-coral">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" loading={loading} className="w-full">
            {isRegister ? 'Create account' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-8 text-sm text-muted">
          {isRegister ? 'Already have an account? ' : 'New here? '}
          <Link href={isRegister ? '/login' : '/register'} className="font-semibold text-brass-strong hover:underline">
            {isRegister ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </div>
    </div>
  );
}
