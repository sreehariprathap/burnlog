// server component - runs on every request
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  const supabase = createServerComponentClient({ cookies });
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return redirect('/auth/login');
  }

  // check for existing Profile row
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .single();

  return redirect(profile ? '/dashboard' : '/auth/profile-setup');
}
