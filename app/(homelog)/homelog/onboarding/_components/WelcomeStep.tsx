// app/(homelog)/homelog/onboarding/_components/WelcomeStep.tsx
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
        <CardTitle>Let&apos;s set up HomeLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Create your household or join one you&apos;ve been invited to. If you&apos;re starting a new household,
          we&apos;ll suggest some starter chores too.
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
