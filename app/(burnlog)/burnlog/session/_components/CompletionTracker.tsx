// app/session/_components/CompletionTracker.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';
import { PlanDay } from './PlanCard';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Trophy } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { computeLevel, computeStreakUpdate } from '@/lib/leveling';
import { AchievementOverlay } from '@/components/AchievementOverlay';

type CompletionData = {
  id?: string;
  date: string;
  completed: boolean;
  notes?: string;
  difficulty?: number;
  duration?: number;
};

type CompletionTrackerProps = {
  plan: PlanDay & { repeatWeekly?: boolean };
  exerciseLog?: Record<string, unknown> | null;
  onComplete: () => void;
};

export function CompletionTracker({ plan, exerciseLog, onComplete }: CompletionTrackerProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState<string>('');
  const [difficulty, setDifficulty] = useState<number>(3);
  const [duration, setDuration] = useState<number>(45);
  const [completed, setCompleted] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [achievement, setAchievement] = useState<{ stats: string[]; celebrate: boolean } | null>(null);
  const hasExercises = !!exerciseLog && Object.keys(exerciseLog).length > 0;
  const [saveAsTemplate, setSaveAsTemplate] = useState(hasExercises);
  const [templateName, setTemplateName] = useState(`${plan.bodyPart} workout`);

  const handleSubmit = async () => {
    try {
      setIsSubmitting(true);
      
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication error",
          description: "Please log in to save your workout",
          variant: "destructive"
        });
        return;
      }

      // Resolve the profile ID associated with this user (sessions.profileId
      // references profiles.id, which is not the same as the auth user id)
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, currentStreak, longestStreak, xp, level, lastSessionDate')
        .eq('userId', user.id)
        .single();

      if (!profileData) {
        toast({
          title: "Profile not found",
          description: "Please complete your profile before logging a workout",
          variant: "destructive"
        });
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      // Save the session completion data
      const { error } = await supabase.from('sessions').insert({
        profileId: profileData.id,
        date: today,
        sessionData: {
          bodyPart: plan.bodyPart,
          dayIndex: plan.dayIndex,
          completed,
          notes,
          difficulty,
          duration,
          exerciseLog
        }
      });
      
      if (error) {
        console.error('Error saving completion:', error);
        toast({
          title: "Error saving workout",
          description: "There was a problem saving your workout record",
          variant: "destructive"
        });
        return;
      }

      if (saveAsTemplate && hasExercises && templateName.trim()) {
        const trimmedName = templateName.trim();
        const { data: existingTemplate } = await supabase
          .from('workout_templates')
          .select('id,useCount')
          .eq('profileId', profileData.id)
          .eq('name', trimmedName)
          .maybeSingle();
        const templatePayload = {
          bodyPart: plan.bodyPart,
          exercises: exerciseLog,
          lastUsedAt: new Date().toISOString(),
        };
        if (existingTemplate) {
          await supabase
            .from('workout_templates')
            .update({ ...templatePayload, useCount: existingTemplate.useCount + 1 })
            .eq('id', existingTemplate.id);
        } else {
          await supabase.from('workout_templates').insert([{ profileId: profileData.id, name: trimmedName, ...templatePayload }]);
        }
      }

      const caloriesBurned = exerciseLog?.caloriesBurned;
      if (typeof caloriesBurned === 'number' && caloriesBurned > 0) {
        const { error: calorieError } = await supabase.from('calorie_burns').insert([
          {
            profileId: profileData.id,
            activityType: typeof exerciseLog?.activityType === 'string' ? exerciseLog.activityType : plan.bodyPart,
            duration: typeof exerciseLog?.durationMinutes === 'number' ? exerciseLog.durationMinutes : duration,
            caloriesBurned,
            notes: typeof exerciseLog?.notes === 'string' ? exerciseLog.notes : null,
          },
        ]);
        if (calorieError) {
          console.error('Error saving calorie burn:', calorieError);
        }
      }

      if (completed) {
        const { newStreak, xpGained } = computeStreakUpdate({
          lastSessionDate: profileData.lastSessionDate,
          today,
          currentStreak: profileData.currentStreak,
        });
        const newXp = profileData.xp + xpGained;

        const { error: streakError } = await supabase
          .from('profiles')
          .update({
            currentStreak: newStreak,
            longestStreak: Math.max(profileData.longestStreak, newStreak),
            xp: newXp,
            level: computeLevel(newXp),
            lastSessionDate: today,
          })
          .eq('id', profileData.id);

        if (streakError) {
          console.error('Error updating streak/xp:', streakError);
        }

        // Celebrate with a sparkled achievement message
        const newLevel = computeLevel(newXp);
        const leveledUp = newLevel > profileData.level;
        const streakMilestone = newStreak > 0 && (newStreak % 7 === 0 || newStreak === 100);

        const stats = [`+${xpGained} XP`, `${newStreak} day streak`];
        if (newStreak > profileData.longestStreak) stats.push('New record!');
        if (leveledUp) stats.push(`Level ${newLevel}!`);

        setAchievement({ stats, celebrate: leveledUp || streakMilestone });
        return;
      }

      toast({
        title: "Workout saved!",
        description: "Your workout has been recorded successfully",
        variant: "default"
      });
      onComplete();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Something went wrong",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <AchievementOverlay
        open={!!achievement}
        title="Workout Complete!"
        message="You showed up and put in the work. Proud of you!"
        stats={achievement?.stats ?? []}
        celebrate={achievement?.celebrate ?? false}
        onClose={() => {
          setAchievement(null);
          onComplete();
        }}
      />

      <div className="flex items-center justify-center space-x-2 py-6">
        <Trophy className="w-8 h-8 text-warning" />
        <h2 className="text-2xl font-bold">Complete Workout</h2>
      </div>

      <Card className="p-4">
        <div className="flex items-center space-x-2 mb-6">
          <Checkbox 
            id="completed" 
            checked={completed} 
            onCheckedChange={(checked) => setCompleted(!!checked)} 
          />
          <Label htmlFor="completed" className="text-lg font-medium">
            Mark workout as completed
          </Label>
        </div>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="duration" className="block mb-2">Workout duration (minutes)</Label>
            <input
              id="duration"
              type="range"
              min="5"
              max="120"
              step="5"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="text-center font-medium mt-1">{duration} minutes</div>
          </div>
          
          <div>
            <Label htmlFor="difficulty" className="block mb-2">Difficulty level</Label>
            <div className="flex justify-between">
              <span>Easy</span>
              <span>Hard</span>
            </div>
            <input
              id="difficulty"
              type="range"
              min="1"
              max="5"
              value={difficulty}
              onChange={(e) => setDifficulty(parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
            </div>
          </div>
          
          {hasExercises && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="saveAsTemplate"
                  checked={saveAsTemplate}
                  onCheckedChange={(checked) => setSaveAsTemplate(!!checked)}
                />
                <Label htmlFor="saveAsTemplate" className="font-medium">
                  Save as a reusable workout
                </Label>
              </div>
              {saveAsTemplate && (
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Name this workout"
                />
              )}
            </div>
          )}

          <div>
            <Label htmlFor="notes" className="block mb-2">Notes (optional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border rounded-md h-24"
              placeholder="How was your workout? Any PRs or challenges?"
            />
          </div>
        </div>
      </Card>
      
      <div className="flex space-x-3 pt-4">
        <Button 
          variant="outline" 
          onClick={onComplete} 
          className="flex-1"
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="flex-1"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save Workout'}
        </Button>
      </div>
    </div>
  );
}