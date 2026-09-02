// app/(learnlog)/learnlog/skills/[id]/_components/LogSessionDrawer.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { AchievementOverlay } from '@/components/AchievementOverlay';
import { computeLevel, computeStreakUpdate } from '@/lib/leveling';
import type { SkillRow } from '@/lib/learnlog/types';

type LogSessionDrawerProps = {
  skill: SkillRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function LogSessionDrawer({ skill, open, onOpenChange, onSaved }: LogSessionDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [duration, setDuration] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [achievement, setAchievement] = useState<{ stats: string[]; celebrate: boolean } | null>(null);

  async function handleSave() {
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const { newStreak, xpGained } = computeStreakUpdate({
        lastSessionDate: skill.lastSessionDate,
        today,
        currentStreak: skill.currentStreak,
      });
      const newXp = skill.xp + xpGained;
      const newLevel = computeLevel(newXp);

      const { error: sessionError } = await supabase.from('learnlog_skill_sessions').insert({
        skillId: skill.id,
        date: today,
        durationMinutes: duration.trim() ? Number(duration) : null,
        notes: notes.trim() || null,
        xpEarned: xpGained,
      });
      if (sessionError) throw sessionError;

      const { error: skillError } = await supabase
        .from('learnlog_skills')
        .update({
          xp: newXp,
          level: newLevel,
          currentStreak: newStreak,
          longestStreak: Math.max(skill.longestStreak, newStreak),
          lastSessionDate: today,
        })
        .eq('id', skill.id);
      if (skillError) throw skillError;

      const leveledUp = newLevel > skill.level;
      const stats = [`+${xpGained} XP`, `${newStreak} day streak`];
      if (newStreak > skill.longestStreak) stats.push('New record!');
      if (leveledUp) stats.push(`Level ${newLevel}!`);

      setDuration('');
      setNotes('');
      onOpenChange(false);
      onSaved();
      setAchievement({ stats, celebrate: leveledUp || (newStreak > 0 && newStreak % 7 === 0) });
    } catch (err) {
      toast({ title: 'Could not log session', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Log a {skill.name} session</DrawerTitle>
          </DrawerHeader>
          <div className="p-4 space-y-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="duration">Duration (minutes, optional)</Label>
              <Input id="duration" type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Log session'}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
      <AchievementOverlay
        open={!!achievement}
        title="Session logged!"
        stats={achievement?.stats ?? []}
        celebrate={achievement?.celebrate ?? false}
        onClose={() => setAchievement(null)}
        autoCloseMs={2500}
      />
    </>
  );
}
