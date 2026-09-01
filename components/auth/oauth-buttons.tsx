'use client';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

const PROVIDERS = [
  {
    id: 'google',
    label: 'Continue with Google',
    icon: (
      <svg viewBox="0 0 24 24" className="size-5">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.87c2.27-2.09 3.55-5.17 3.55-8.68Z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.94-2.9l-3.87-3.02c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.28v3.11A12 12 0 0 0 12 24Z"/>
        <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 0 1 0-4.54V6.62H1.28a12 12 0 0 0 0 10.76l3.99-3.11Z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.94 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.11C6.22 6.86 8.87 4.75 12 4.75Z"/>
      </svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Continue with Facebook',
    icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="#1877F2">
        <path d="M24 12.07C24 5.71 18.63.5 12 .5S0 5.71 0 12.07c0 5.74 4.35 10.5 10.02 11.36v-8.03H7.08v-3.33h2.94V9.5c0-2.87 1.75-4.45 4.4-4.45 1.27 0 2.6.22 2.6.22v2.8h-1.46c-1.44 0-1.89.88-1.89 1.79v2.15h3.22l-.51 3.33h-2.71v8.03C19.65 22.57 24 17.8 24 12.07Z"/>
      </svg>
    ),
  },
  {
    id: 'apple',
    label: 'Continue with Apple',
    icon: (
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
        <path d="M16.36 1.43c0 1.14-.46 2.24-1.2 3.05-.8.86-2.12 1.53-3.2 1.44-.13-1.1.42-2.25 1.18-3.02.83-.85 2.24-1.5 3.22-1.47ZM20.13 17.3c-.55 1.26-.82 1.82-1.53 2.94-.99 1.56-2.39 3.5-4.12 3.52-1.54.02-1.94-1-4.03-.99-2.1.01-2.54 1.01-4.08.99-1.73-.02-3.06-1.77-4.05-3.33C-.35 16.42-.7 11.2 1.28 8.42c1.4-1.96 3.6-3.11 5.66-3.11 2.1 0 3.42 1.14 5.16 1.14 1.68 0 2.71-1.15 5.14-1.15 1.83 0 3.77 1 5.15 2.72-4.53 2.48-3.79 8.94-2.26 9.28Z"/>
      </svg>
    ),
  },
] as const;

export function OAuthButtons() {
  const supabase = createClient();

  const handleOAuth = (provider: 'google' | 'facebook' | 'apple') => {
    supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="flex justify-center gap-3">
      {PROVIDERS.map(p => (
        <Button
          key={p.id}
          type="button"
          variant="outline"
          size="icon"
          aria-label={p.label}
          onClick={() => handleOAuth(p.id)}
        >
          {p.icon}
        </Button>
      ))}
    </div>
  );
}
