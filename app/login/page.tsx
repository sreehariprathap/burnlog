'use client';
import { useState, useCallback } from 'react';
import { useRouter }         from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button }            from '@/components/ui/button';
import { Input }             from '@/components/ui/input';
import { Label }             from '@/components/ui/label';
import { Loader2 }           from 'lucide-react';
import Image                 from 'next/image';

export default function LoginPage() {
  const supabase = createClientComponentClient();
  const router   = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // 1️⃣ Sign in
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // 2️⃣ Always lead into profile-setup
    router.push('/signup/profile');
    setLoading(false);
  }, [email, password, supabase, router]);

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
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            {error && (
              <p className="text-red-500 text-sm">{error}</p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
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
