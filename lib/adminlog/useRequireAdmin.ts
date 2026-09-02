'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useCurrentProfile, type CurrentProfile } from '@/lib/useCurrentProfile';

export function useRequireAdmin(): { profile: CurrentProfile | null; loading: boolean } {
  const { profile, loading } = useCurrentProfile();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!profile || !profile.isAdmin)) {
      router.replace('/logbook');
    }
  }, [loading, profile, router]);

  return { profile, loading };
}
