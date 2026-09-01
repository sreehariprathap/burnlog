// app/(tasklog)/tasklog/onboarding/_components/WelcomeStep.tsx
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
        <CardTitle>Let&apos;s set up TaskLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add 1–3 goals you want to make progress on — we&apos;ll break each one into concrete tasks you can start
          today. You can skip this and add goals later from the Goals tab.
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
