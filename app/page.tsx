import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Home() {
  // instantiate Supabase on the server
  const supabase = createServerComponentClient({ cookies });

  // fetch the current session
  const {
    data: { session }
  } = await supabase.auth.getSession();

  // if logged in, go to dashboard; otherwise, go to login
  if (session) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
