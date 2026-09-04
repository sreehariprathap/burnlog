// app/(sociallog)/sociallog/onboarding/_components/WelcomeStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface WelcomeStepProps {
  onStart: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onStart, onSkip }: WelcomeStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Let&apos;s set up your SocialLog profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A quick bio, your privacy preference, and a few interests — so people connecting with you get a real
          sense of who you are. You can change any of this later from Settings.
        </p>
        <div className="flex gap-2">
          <Button onClick={onStart}>Get started</Button>
          <Button variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
