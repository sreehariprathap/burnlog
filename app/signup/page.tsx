'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { useToast } from '@/components/ui/use-toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// Client Component — no static <Metadata> export; page title stays the
// default set by the root layout.

export default function SignUpPage() {
  const supabase = createClient();
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; confirmPassword?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nextFieldErrors: { email?: string; password?: string; confirmPassword?: string } = {};
    if (!EMAIL_RE.test(email)) nextFieldErrors.email = 'Enter a valid email address';
    if (password.length < MIN_PASSWORD_LENGTH) nextFieldErrors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    if (confirmPassword !== password) nextFieldErrors.confirmPassword = 'Passwords don’t match';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setLoading(true);

    const { error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) {
      setError(authError.message);
      toast({ title: 'Sign up failed', description: authError.message, variant: 'destructive' });
    } else {
      setSent(true);
      toast({ description: 'Account created — check your email to confirm.' });
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center ">
      <Card className="w-full max-w-md">
        <CardHeader className='flex flex-col items-center gap-3'>
          <Image src="/burnlog-icon-splash.png" alt="Logo" width={400} height={400} className="" />
          <CardTitle>Create Account</CardTitle></CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="email" autoFocus value={email}
                  onChange={e=>{ setEmail(e.target.value); setFieldErrors(f=>({ ...f, email: undefined })); }}
                  required aria-invalid={!!fieldErrors.email} />
                {fieldErrors.email && <p className="text-red-500 text-xs">{fieldErrors.email}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="new-password" value={password}
                  onChange={e=>{ setPassword(e.target.value); setFieldErrors(f=>({ ...f, password: undefined })); }}
                  required aria-invalid={!!fieldErrors.password} />
                {fieldErrors.password && <p className="text-red-500 text-xs">{fieldErrors.password}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword}
                  onChange={e=>{ setConfirmPassword(e.target.value); setFieldErrors(f=>({ ...f, confirmPassword: undefined })); }}
                  required aria-invalid={!!fieldErrors.confirmPassword} />
                {fieldErrors.confirmPassword && <p className="text-red-500 text-xs">{fieldErrors.confirmPassword}</p>}
              </div>
              {error && <p className="text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading} aria-label={loading ? 'Signing up' : undefined}>
                {loading ? <Loader2 className="animate-spin"/> : 'Sign Up'}
              </Button>
              <p className="text-sm text-center ">Already have an account? <a href="/login" className="text-amber-500">Log In</a></p>
            </form>
          ) : (
            <div className="text-center space-y-4">
              <p>Check your email (<b>{email}</b>) to confirm.</p>
              <Button onClick={()=>router.push('/login')}>Back to Login</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
