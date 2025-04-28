// server component - runs on every request
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();


  // If no session, redirect to login
  if (!session) {
    return redirect('/login');
  }

  // Check for existing Profile row
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('userId', session.user.id)
    .single();

  // If no profile, redirect to profile setup
  if (!profile) {
    return redirect('/signup/profile');
  }

  // User is authenticated and has a profile, redirect to dashboard
  return redirect('/dashboard');
}
