// app/(sociallog)/sociallog/onboarding/_components/SocialLogOnboardingFlow.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/apiFetch';
import { WelcomeStep } from './WelcomeStep';
import { BioStep } from './BioStep';
import { AvatarStep } from './AvatarStep';
import { InterestsStep } from './InterestsStep';

type Step = 'loading' | 'welcome' | 'bio' | 'avatar' | 'interests';

export function SocialLogOnboardingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/sociallog';
  const supabase = createClient();

  const [step, setStep] = useState<Step>('loading');
  const [profile, setProfile] = useState<{ userId: string; firstName: string; lastName: string; avatarUrl: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login');
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('firstName, lastName, avatarUrl')
        .eq('userId', user.id)
        .single();
      if (!data) {
        router.replace('/signup/profile');
        return;
      }
      setProfile({ userId: user.id, firstName: data.firstName, lastName: data.lastName, avatarUrl: data.avatarUrl ?? null });
      setStep('welcome');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    router.push(returnTo);
  }

  if (step === 'loading' || !profile) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (step === 'welcome') {
    return <WelcomeStep onStart={() => setStep('bio')} onSkip={finish} />;
  }

  if (step === 'bio') {
    return (
      <BioStep
        onContinue={async (bio, isPrivate) => {
          await apiFetch('/api/sociallog/profile-settings', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bio, isPrivate }),
          });
          setStep('avatar');
        }}
        onSkip={() => setStep('avatar')}
      />
    );
  }

  if (step === 'avatar') {
    return (
      <AvatarStep
        userId={profile.userId}
        firstName={profile.firstName}
        lastName={profile.lastName}
        avatarUrl={profile.avatarUrl}
        onUploaded={(url) => setProfile({ ...profile, avatarUrl: url })}
        onContinue={() => setStep('interests')}
      />
    );
  }

  return (
    <InterestsStep
      onContinue={async (interests, hobbies) => {
        await apiFetch('/api/sociallog/profile-settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ interests, hobbies }),
        });
        finish();
      }}
      onSkip={finish}
    />
  );
}
