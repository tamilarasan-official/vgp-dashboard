'use client';

import { useActionState } from 'react';
import { login, type LoginState } from './actions';

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4 rounded-xl border border-line bg-card p-6 shadow-sm">
      <label className="block text-sm">
        <span className="text-muted">Email</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      <label className="block text-sm">
        <span className="text-muted">Password</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-line bg-background px-3 py-2 outline-none focus:border-accent"
        />
      </label>
      {state.error && <p className="text-sm text-rose-600 dark:text-rose-400">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-3 py-2 font-medium text-white hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
