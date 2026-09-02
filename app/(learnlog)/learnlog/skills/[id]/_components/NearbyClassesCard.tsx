// app/(learnlog)/learnlog/skills/[id]/_components/NearbyClassesCard.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import type { SkillRow } from '@/lib/learnlog/types';
import type { ClassIdea } from '@/lib/learnlog/suggestions';

type NearbyClassesCardProps = {
  skill: SkillRow;
};

async function fetchUpcomingDestination(profileId: string, category: string | null): Promise<string | null> {
  if (!category) return null;
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('travellog_visits')
    .select('placeName,country')
    .eq('profileId', profileId)
    .gte('arrivalDate', today)
    .order('arrivalDate', { ascending: true })
    .limit(5);
  const match = (data ?? []).find((v: { placeName: string; country: string }) =>
    `${v.placeName} ${v.country}`.toLowerCase().includes(category.toLowerCase())
  );
  return match ? `${match.placeName}, ${match.country}` : null;
}

export function NearbyClassesCard({ skill }: NearbyClassesCardProps) {
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<ClassIdea[] | null>(null);

  const city = (profile?.learnLogCity as string) || '';
  const aiEnabled = (profile?.learnLogAiEnabled as boolean) ?? true;

  async function handleFind() {
    if (!city) {
      toast({ title: 'Set your city first', description: 'Add a city in LearnLog Config to get suggestions.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const upcomingDestination = profile ? await fetchUpcomingDestination(profile.id, skill.category) : null;
      const res = await fetch('/api/ai/learnlog/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skillName: skill.name, skillCategory: skill.category, city, upcomingDestination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to get suggestions');
      setIdeas(data.ideas as ClassIdea[]);
    } catch (err) {
      toast({ title: 'Could not get suggestions', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (!aiEnabled) return null;

  return (
    <Card>
      <CardContent className="pt-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm">Nearby classes</p>
          <Button size="sm" variant="outline" onClick={handleFind} disabled={loading}>
            {loading ? 'Finding…' : 'Find nearby classes'}
          </Button>
        </div>
        {ideas && (
          <>
            <p className="text-xs text-muted-foreground">AI-generated ideas, not verified listings.</p>
            {ideas.map((idea, i) => (
              <div key={i} className="text-sm">
                <p className="font-medium">{idea.title}</p>
                <p className="text-xs text-muted-foreground">{idea.provider} — {idea.rationale}</p>
              </div>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
