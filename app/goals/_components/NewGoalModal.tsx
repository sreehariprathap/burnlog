// components/NewGoalModal.tsx
'use client';

import { useState } from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { PlusIcon } from 'lucide-react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

const GoalOptions: Record<string, string> = {
  WEIGHT_LOSS: 'Lose Weight (kg)',
  MUSCLE_GAIN: 'Gain Muscle (kg)',
  TONE: 'Tone Body',
  // add more here as needed
};

type NewGoalModalProps = {
  onAdded: () => void;
};

export function NewGoalModal({ onAdded }: NewGoalModalProps) {
  const supabase = createClientComponentClient();
  const [open, setOpen] = useState(false);
  const [goalType, setGoalType] = useState<keyof typeof GoalOptions>('WEIGHT_LOSS');
  const [targetValue, setTargetValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    if (!targetValue) {
      setError('Please enter a target value.');
      return;
    }
    setLoading(true);

    // get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError(userError?.message || 'Not authenticated');
      setLoading(false);
      return;
    }

    // insert into fitness_goals
    const { error: insertError } = await supabase
      .from('fitness_goals')
      .insert({
        profileId: user.id,
        goalType,
        targetValue: parseFloat(targetValue)
      });

    if (insertError) {
      setError(insertError.message);
    } else {
      // close & refresh parent list
      setTargetValue('');
      setOpen(false);
      onAdded();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Floating + button trigger */}
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="fixed bottom-20 right-4 rounded-full w-14 h-14 shadow-lg"
        >
          <PlusIcon className="w-6 h-6" />
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Fitness Goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="modal-goalType">Goal Type</Label>
            <Select
              value={goalType}
              onValueChange={(val) => setGoalType(val as keyof typeof GoalOptions)}
            >
              <SelectTrigger id="modal-goalType" className="w-full">
                <SelectValue placeholder="Select a goal" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(GoalOptions).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="modal-targetValue">Target Value</Label>
            <Input
              id="modal-targetValue"
              type="number"
              placeholder="e.g. 5"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={loading}>
            {loading ? 'Adding…' : 'Add Goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
