// app/(tasklog)/tasklog/onboarding/_components/DoneStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PartyPopper } from 'lucide-react';

interface DoneStepProps {
  goalCount: number;
  taskCount: number;
  onFinish: () => void;
}

export function DoneStep({ goalCount, taskCount, onFinish }: DoneStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PartyPopper className="h-5 w-5 text-amber-500" />
          You&apos;re set!
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {goalCount} goal{goalCount === 1 ? '' : 's'} and {taskCount} task{taskCount === 1 ? '' : 's'} ready to go.
          Let&apos;s get moving.
        </p>
        <Button className="w-full" onClick={onFinish}>
          Go to TaskLog
        </Button>
      </CardContent>
    </Card>
  );
}
