// components/AddWorkoutModal.tsx
'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PlanDay } from './PlanCard';
import { Dumbbell, PersonStanding, Pickaxe, Bed, Footprints, Bike } from 'lucide-react';

const daysOfWeek = [
  { index: 0, label: 'Sun' },
  { index: 1, label: 'Mon' },
  { index: 2, label: 'Tue' },
  { index: 3, label: 'Wed' },
  { index: 4, label: 'Thu' },
  { index: 5, label: 'Fri' },
  { index: 6, label: 'Sat' }
];

const bodyPartOptions = [
  { value: 'Push', label: 'Push', icon: Dumbbell },
  { value: 'Pull', label: 'Pull', icon: Pickaxe },
  { value: 'Legs', label: 'Legs', icon: Footprints },
  { value: 'Full Body', label: 'Full Body', icon: PersonStanding },
  { value: 'Cardio', label: 'Cardio', icon: Bike },
  { value: 'Rest', label: 'Rest', icon: Bed },
];

type AddWorkoutModalProps = {
  open: boolean;
  initialDay: number;
  onOpenChange: (open: boolean) => void;
  onSaved: (plan: PlanDay & { repeatWeekly: boolean }) => void;
};

export function AddWorkoutModal({
  open,
  initialDay,
  onOpenChange,
  onSaved
}: AddWorkoutModalProps) {
  const [dayIndex, setDayIndex] = useState<number>(initialDay);
  const [bodyPart, setBodyPart] = useState<string>(bodyPartOptions[0].value);
  const [repeatWeekly, setRepeatWeekly] = useState<boolean>(false);

  const handleSave = () => {
    onSaved({ dayIndex, bodyPart, repeatWeekly });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="fixed bottom-20 right-4 rounded-full w-14 h-14 shadow-lg">
          +
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Setup Workout</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Day selector */}
          <div>
            <Label>Day of Week</Label>
            <div className="grid grid-cols-7 gap-2 mt-2">
              {daysOfWeek.map(d => (
                <button
                  key={d.index}
                  type="button"
                  className={`p-3 text-center rounded ${
                    dayIndex === d.index
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                  onClick={() => setDayIndex(d.index)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Body part picker */}
          <div>
            <Label>Body Part</Label>
            <div className="grid grid-cols-3 gap-4 mt-2">
              {bodyPartOptions.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    className={`flex flex-col items-center p-4 border rounded-lg space-y-1 transition ${
                      bodyPart === opt.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200'
                    }`}
                    onClick={() => setBodyPart(opt.value)}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-sm">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Repeat weekly toggle */}
          <div className="flex items-center gap-2">
            <Switch
              id="repeat-weekly"
              checked={repeatWeekly}
              onCheckedChange={setRepeatWeekly}
            />
            <Label htmlFor="repeat-weekly">Repeat every week</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
