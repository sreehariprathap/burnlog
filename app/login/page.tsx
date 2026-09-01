'use client';
import { useState, useCallback } from 'react';
import { useRouter }         from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button }            from '@/components/ui/button';
import { Input }             from '@/components/ui/input';
import { Label }             from '@/components/ui/label';
import { Loader2 }           from 'lucide-react';
import Image                 from 'next/image';
import { useToast }          from '@/components/ui/use-toast';

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
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col items-center gap-3">
          <Image
            src="/burnlog-icon-splash.png"
            alt="Logo"
            width={400}
            height={400}
          />
          <CardTitle>Log In</CardTitle>
        </CardHeader>
        <CardContent>
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
              {fieldErrors.email && <p className="text-red-500 text-xs">{fieldErrors.email}</p>}
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
              {fieldErrors.password && <p className="text-red-500 text-xs">{fieldErrors.password}</p>}
            </div>
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
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
              className="text-amber-500 hover:underline"
            >
              Sign Up
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
