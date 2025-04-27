'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export default function SignUpPage() {
  const supabase = createClientComponentClient();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string|null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) setError(authError.message);
    else setSent(true);

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>Create Account</CardTitle></CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email}
                  onChange={e=>setEmail(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password}
                  onChange={e=>setPassword(e.target.value)} required />
              </div>
              {error && <p className="text-red-500">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="animate-spin"/> : 'Sign Up'}
              </Button>
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
