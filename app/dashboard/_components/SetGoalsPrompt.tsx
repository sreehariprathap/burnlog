'use client';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function SetGoalsPrompt() {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center p-6 bg-yellow-100 rounded-md space-y-4">
      <p className="text-center">You have no fitness goals yet.</p>
      <Button onClick={() => router.push('/goals')}>Set Fitness Goals</Button>
    </div>
  );
}