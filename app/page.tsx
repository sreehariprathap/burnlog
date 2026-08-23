// server component - runs on every request
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { BootRedirect } from '@/components/BootRedirect';

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });
  // getUser() validates against Supabase's auth server instead of trusting
  // locally-decoded cookie state (which raced with middleware's token
  // refresh and intermittently logged authenticated users out in prod).
  const { data: { user } } = await supabase.auth.getUser();

  // If no session, redirect to login
  if (!user) {
    return redirect('/login');
  }

  // Check for existing Profile row
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('userId', user.id)
    .single();

  // If no profile, redirect to profile setup
  if (!profile) {
    return redirect('/signup/profile');
  }

  // User is authenticated and has a profile — boot into their default app
  return <BootRedirect />;
}
