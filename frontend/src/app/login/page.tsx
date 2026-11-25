import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in · VGP Dashboard' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">V</div>
          <h1 className="mt-3 text-xl font-semibold">VGP Executive Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Sign in to continue</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-xs text-muted">For VGP management and authorised staff only.</p>
      </div>
    </main>
  );
}
