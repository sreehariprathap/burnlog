'use client';
import { useState, useCallback } from 'react';
import { useRouter }         from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button }            from '@/components/ui/button';
import { Input }             from '@/components/ui/input';
import { Label }             from '@/components/ui/label';
import { Loader2 }           from 'lucide-react';
import Image                 from 'next/image';
import { useToast }          from '@/components/ui/use-toast';
import { OAuthButtons }      from '@/components/auth/oauth-buttons';
import { BackgroundRippleEffect } from '@/components/ui/background-ripple-effect';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Client Component — no static <Metadata> export; page title stays the
// default set by the root layout.

export default function LoginPage() {
  const supabase = createClient();
  const router   = useRouter();
  const { toast } = useToast();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!EMAIL_RE.test(email)) nextFieldErrors.email = 'Enter a valid email address';
    if (!password) nextFieldErrors.password = 'Enter your password';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setLoading(true);

    // 1️⃣ Sign in
    const { error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      toast({ title: 'Log in failed', description: authError.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // 2️⃣ Always lead into profile-setup
    router.push('/signup/profile');
    setLoading(false);
  }, [email, password, supabase, router, toast]);

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background p-4">
      <BackgroundRippleEffect />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/60 via-transparent to-background/60" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-background/40 p-8 shadow-lg backdrop-blur-xl">
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/icons/logbook-light.png"
            alt="The Logbook"
            width={260}
            height={78}
            priority
          />
          <h1 className="text-lg font-semibold leading-none">Log In</h1>
        </div>
        <div className="mt-6">
          <OAuthButtons />
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={e => { setEmail(e.target.value); setFieldErrors(f => ({ ...f, email: undefined })); }}
                required
                disabled={loading}
                aria-invalid={!!fieldErrors.email}
              />
              {fieldErrors.email && <p className="text-destructive text-xs">{fieldErrors.email}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setFieldErrors(f => ({ ...f, password: undefined })); }}
                required
                disabled={loading}
                aria-invalid={!!fieldErrors.password}
              />
              {fieldErrors.password && <p className="text-destructive text-xs">{fieldErrors.password}</p>}
            </div>
            {error && (
              <p className="text-destructive text-sm">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              aria-label={loading ? 'Logging in' : undefined}
            >
              {loading
                ? <Loader2 className="animate-spin w-5 h-5" />
                : 'Log In'
              }
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            Don’t have an account?{' '}
            <a
              href="/signup"
              className="text-primary hover:underline"
            >
              Sign Up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
