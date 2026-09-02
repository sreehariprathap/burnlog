// app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import type { SkillRow } from '@/lib/learnlog/types';

type NearbyClassesCardProps = {
  skill: SkillRow;
};

// Task 10 replaces this body with the AI-suggestions trigger + list.
export function NearbyClassesCard({ skill }: NearbyClassesCardProps) {
  return (
    <Card>
      <CardContent className="pt-4 text-sm text-muted-foreground">
        Nearby classes for {skill.name} — coming up next.
      </CardContent>
    </Card>
  );
}
