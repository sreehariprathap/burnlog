// app/(sociallog)/sociallog/onboarding/_components/InterestsStep.tsx
'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const INTEREST_OPTIONS = [
  { emoji: '🎮', label: 'Gaming' },
  { emoji: '📚', label: 'Reading' },
  { emoji: '🎬', label: 'Movies & TV' },
  { emoji: '🎵', label: 'Music' },
  { emoji: '🍳', label: 'Cooking' },
  { emoji: '✈️', label: 'Travel' },
  { emoji: '🐾', label: 'Pets' },
  { emoji: '🧘', label: 'Wellness' },
  { emoji: '💻', label: 'Tech' },
  { emoji: '🎨', label: 'Art & design' },
  { emoji: '📈', label: 'Finance' },
  { emoji: '🌱', label: 'Sustainability' },
  { emoji: '🔬', label: 'Science' },
  { emoji: '📷', label: 'Photography' },
  { emoji: '🛍️', label: 'Fashion' },
];

const HOBBY_OPTIONS = [
  { emoji: '🏋️', label: 'Gym' },
  { emoji: '🏃', label: 'Running' },
  { emoji: '🚴', label: 'Cycling' },
  { emoji: '🎣', label: 'Fishing' },
  { emoji: '🧶', label: 'Crafting' },
  { emoji: '♟️', label: 'Chess' },
  { emoji: '🎸', label: 'Playing music' },
  { emoji: '🧩', label: 'Puzzles' },
  { emoji: '⛰️', label: 'Hiking' },
  { emoji: '🏊', label: 'Swimming' },
  { emoji: '⚽', label: 'Soccer' },
  { emoji: '🏀', label: 'Basketball' },
  { emoji: '🎳', label: 'Bowling' },
  { emoji: '🧗', label: 'Climbing' },
  { emoji: '🍷', label: 'Wine tasting' },
];

function TagGrid({ options, selected, onToggle }: { options: typeof INTEREST_OPTIONS; selected: Set<string>; onToggle: (label: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(({ emoji, label }) => {
        const isSelected = selected.has(label);
        return (
          <button
            key={label}
            type="button"
            onClick={() => onToggle(label)}
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
              isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-muted'
            )}
          >
            <span>{emoji}</span>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

interface InterestsStepProps {
  onContinue: (interests: string[], hobbies: string[]) => void;
  onSkip: () => void;
}

export function InterestsStep({ onContinue, onSkip }: InterestsStepProps) {
  const [interests, setInterests] = useState<Set<string>>(new Set());
  const [hobbies, setHobbies] = useState<Set<string>>(new Set());

  function toggle(set: Set<string>, setSet: (next: Set<string>) => void, label: string) {
    const next = new Set(set);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    setSet(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>What are you into?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">Interests</p>
          <TagGrid options={INTEREST_OPTIONS} selected={interests} onToggle={(l) => toggle(interests, setInterests, l)} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Hobbies</p>
          <TagGrid options={HOBBY_OPTIONS} selected={hobbies} onToggle={(l) => toggle(hobbies, setHobbies, l)} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => onContinue(Array.from(interests), Array.from(hobbies))}>Finish</Button>
          <Button variant="outline" onClick={onSkip}>Skip for now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
