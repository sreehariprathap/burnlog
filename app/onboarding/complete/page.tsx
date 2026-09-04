'use client';

import { useRouter } from 'next/navigation';
import { FireworksBackground } from '@/components/kokonutui/fireworks-background';
import { LogbookMark } from '@/components/LogbookMark';
import { Button } from '@/components/ui/button';

export default function OnboardingCompletePage() {
  const router = useRouter();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden p-6 text-center">
      <FireworksBackground />
      <div className="relative z-10 flex flex-col items-center gap-4">
        <LogbookMark size={64} />
        <h1 className="text-3xl font-bold">Welcome to LogBook</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Everything&apos;s set up — your day, across every app you picked, starts now.
        </p>
      </div>
      <Button size="lg" className="relative z-10" onClick={() => router.push('/logbook')}>
        Continue
      </Button>
    </div>
  );
}
