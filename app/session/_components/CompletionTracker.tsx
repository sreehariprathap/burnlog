// app/session/_components/CompletionTracker.tsx
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { PlanDay } from './PlanCard';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Trophy } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

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
  onComplete: () => void;
};

export function CompletionTracker({ plan, onComplete }: CompletionTrackerProps) {
  const supabase = createClientComponentClient();
  const { toast } = useToast();
  const [notes, setNotes] = useState<string>('');
  const [difficulty, setDifficulty] = useState<number>(3);
  const [duration, setDuration] = useState<number>(45);
  const [completed, setCompleted] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
      
      const today = new Date().toISOString().split('T')[0];
      
      // Save the session completion data
      const { error } = await supabase.from('sessions').insert({
        profileId: user.id,
        date: today,
        sessionData: {
          bodyPart: plan.bodyPart,
          dayIndex: plan.dayIndex,
          completed,
          notes,
          difficulty,
          duration
        }
      });
      
      if (error) {
        console.error('Error saving completion:', error);
        toast({
          title: "Error saving workout",
          description: "There was a problem saving your workout record",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Workout saved!",
          description: "Your workout has been recorded successfully",
          variant: "default"
        });
        onComplete();
      }
    } catch (error) {
      console.error('Unexpected error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-center space-x-2 py-6">
        <Trophy className="w-8 h-8 text-yellow-500" />
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