// app/(sociallog)/sociallog/onboarding/_components/AvatarStep.tsx
'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ProfileAvatar } from '@/app/profile/_components/ProfileAvatar';

interface AvatarStepProps {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  onUploaded: (url: string) => void;
  onContinue: () => void;
}

export function AvatarStep({ userId, firstName, lastName, avatarUrl, onUploaded, onContinue }: AvatarStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a profile photo (optional)</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <ProfileAvatar
          userId={userId}
          firstName={firstName}
          lastName={lastName}
          avatarUrl={avatarUrl}
          onUploaded={onUploaded}
        />
        <Button onClick={onContinue} className="w-full">Continue</Button>
      </CardContent>
    </Card>
  );
}
