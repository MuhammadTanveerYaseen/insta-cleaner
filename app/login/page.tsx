import { Suspense } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';

import { LoginForm } from './login-form';

export const metadata = {
  title: 'Sign in · Instagram Lead Refinement',
};

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
