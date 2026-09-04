// app/(homelog)/homelog/onboarding/_components/DoneStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PartyPopper } from 'lucide-react';

interface DoneStepProps {
  choreCount: number;
  /** Label for the continue button — reflects the actual next destination. */
  finishLabel?: string;
  onFinish: () => void;
}

export function DoneStep({ choreCount, finishLabel = 'Go to HomeLog', onFinish }: DoneStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-warning" />
          Your household is set up!
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {choreCount > 0
            ? `${choreCount} starter chore${choreCount === 1 ? '' : 's'} ready to go.`
            : 'Add chores anytime from the Chores tab.'}
        </p>
        <Button className="w-full" onClick={onFinish}>
          {finishLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
