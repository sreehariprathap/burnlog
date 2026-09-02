// app/(learnlog)/learnlog/onboarding/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import type { OnboardingResult } from '@/lib/learnlog/onboarding';

export default function LearnLogOnboardingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo') || '/learnlog';
  const { profile } = useCurrentProfile();
  const { toast } = useToast();
  const supabase = createClient();

  const [interests, setInterests] = useState('');
  const [readingGoals, setReadingGoals] = useState('');
  const [careerFocus, setCareerFocus] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [wantsGoal, setWantsGoal] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/learnlog/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ interests, readingGoals, careerFocus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate suggestions');
      setResult(data as OnboardingResult);
      setSelectedSkills(new Set((data as OnboardingResult).skills));
      setSelectedItems(new Set((data as OnboardingResult).libraryItems.map((_, i) => i)));
    } catch (err) {
      toast({ title: 'Could not generate suggestions', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  }

  async function handleAccept() {
    if (!profile || !result) return;
    setSaving(true);
    try {
      const skillRows = Array.from(selectedSkills).map((name) => ({ profileId: profile.id, name }));
      if (skillRows.length > 0) {
        const { error } = await supabase.from('learnlog_skills').insert(skillRows);
        if (error) throw error;
      }

      if (wantsGoal && result.careerGoal) {
        const { error } = await supabase.from('learnlog_career_goals').insert({
          profileId: profile.id,
          title: result.careerGoal,
          status: 'active',
        });
        if (error) throw error;
      }

      const itemRows = result.libraryItems
        .filter((_, i) => selectedItems.has(i))
        .map((item) => ({ profileId: profile.id, type: item.type, title: item.title, status: 'WANT' }));
      if (itemRows.length > 0) {
        const { error } = await supabase.from('learnlog_library_items').insert(itemRows);
        if (error) throw error;
      }

      toast({ description: 'LearnLog set up!' });
      router.push(returnTo);
    } catch (err) {
      toast({ title: 'Could not save your selections', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen pb-24">
      <TopBar title="Set up LearnLog" onClose={() => router.push(returnTo)} />
      <div className="p-4 flex flex-col gap-4">
        {!result && (
          <>
            <div className="flex flex-col gap-2">
              <Label htmlFor="interests">What skills or hobbies are you developing?</Label>
              <Textarea id="interests" value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="e.g. skiing, boxing, learning guitar" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="readingGoals">What do you want to read or take a course on?</Label>
              <Textarea id="readingGoals" value={readingGoals} onChange={(e) => setReadingGoals(e.target.value)} placeholder="e.g. leadership, machine learning" />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="careerFocus">What's your career focus right now?</Label>
              <Textarea id="careerFocus" value={careerFocus} onChange={(e) => setCareerFocus(e.target.value)} placeholder="e.g. growing into a senior engineering role" />
            </div>
            <Button className="w-full" onClick={handleGenerate} disabled={generating || !interests.trim() || !readingGoals.trim() || !careerFocus.trim()}>
              {generating ? 'Generating…' : 'Generate suggestions'}
            </Button>
          </>
        )}

        {result && (
          <>
            <Card>
              <CardContent className="pt-4 flex flex-col gap-2">
                <p className="font-medium text-sm">Skills to track</p>
                {result.skills.map((s) => (
                  <div key={s} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedSkills.has(s)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedSkills);
                        if (v) next.add(s); else next.delete(s);
                        setSelectedSkills(next);
                      }}
                    />
                    <span className="text-sm">{s}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex items-center gap-2">
                <Checkbox checked={wantsGoal} onCheckedChange={(v) => setWantsGoal(!!v)} />
                <span className="text-sm">{result.careerGoal}</span>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 flex flex-col gap-2">
                <p className="font-medium text-sm">Library</p>
                {result.libraryItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Checkbox
                      checked={selectedItems.has(i)}
                      onCheckedChange={(v) => {
                        const next = new Set(selectedItems);
                        if (v) next.add(i); else next.delete(i);
                        setSelectedItems(next);
                      }}
                    />
                    <span className="text-sm">{item.title} ({item.type === 'BOOK' ? 'Book' : 'Course'})</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Button className="w-full" onClick={handleAccept} disabled={saving}>
              {saving ? 'Saving…' : 'Add to LearnLog'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
