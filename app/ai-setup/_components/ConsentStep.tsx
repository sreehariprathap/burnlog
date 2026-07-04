'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

type ConsentStepProps = {
  onAccept: () => void;
  onDecline: () => void;
};

export function ConsentStep({ onAccept, onDecline }: ConsentStepProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          Enable AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          burnlog can use AI (via OpenRouter, an external AI provider) to generate a
          personalized workout plan and future suggestions based on your profile and
          lifestyle answers. Your data is sent to the AI provider only to generate these
          suggestions.
        </p>
        <p className="text-sm text-muted-foreground">
          You can turn this on or off at any time from your Profile page.
        </p>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onDecline}>Not now</Button>
          <Button onClick={onAccept}>Enable AI Insights</Button>
        </div>
      </CardContent>
    </Card>
  );
}
