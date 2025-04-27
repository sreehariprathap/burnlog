'use server';

import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  // 1️⃣ Await the cookies store before using it
  const cookieStore = await cookies();

  // 2️⃣ Instantiate Supabase client with async cookies provider
  const supabase = createServerComponentClient({ cookies: () => cookieStore });

  // 3️⃣ Get current auth session
  const {
    data: { session }
  } = await supabase.auth.getSession();

  // 4️⃣ Not logged in? Send to /login
  if (!session) {
    redirect('/login');
  }

  // 5️⃣ Logged in: check if a Profile row exists for this user
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', session.user.id)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking profile:', error);
  }

  // 6️⃣ If no profile row found → send to profile setup
  if (!profile) {
    redirect('/signup/profile');
  }

  // 7️⃣ Otherwise, everything is set → go to dashboard
  redirect('/dashboard');
}
