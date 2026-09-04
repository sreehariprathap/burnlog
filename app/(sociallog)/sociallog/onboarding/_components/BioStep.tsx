// app/(sociallog)/sociallog/onboarding/_components/BioStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

interface BioStepProps {
  onContinue: (bio: string, isPrivate: boolean) => void;
  onSkip: () => void;
}

export function BioStep({ onContinue, onSkip }: BioStepProps) {
  const [bio, setBio] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tell people a bit about you</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="onboarding-bio">Bio</Label>
          <Textarea
            id="onboarding-bio" value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="A sentence or two about you" rows={3}
          />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="onboarding-private">Private profile</Label>
            <p className="text-xs text-muted-foreground">Only approved followers can see your posts and activity.</p>
          </div>
          <Switch id="onboarding-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onContinue(bio, isPrivate)}>Continue</Button>
          <Button variant="outline" onClick={onSkip}>Skip for now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
