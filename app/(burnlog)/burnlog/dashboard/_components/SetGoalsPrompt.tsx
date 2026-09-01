'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Target } from 'lucide-react';

export function SetGoalsPrompt() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-yellow-100 rounded-md space-y-2 text-center">
      <Target className="w-8 h-8 text-primary" aria-hidden="true" />
      <p className="font-medium">No fitness goals yet</p>
      <p className="text-sm text-muted-foreground">Set a goal to start tracking your progress.</p>
      <Button className="mt-2" onClick={() => router.push('/burnlog/goals')}>Set Fitness Goals</Button>
    </div>
  );
}