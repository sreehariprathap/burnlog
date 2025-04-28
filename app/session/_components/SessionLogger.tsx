// components/SessionLogger.tsx
'use client';

import React, { useState } from 'react';
import { PlanDay } from './PlanCard';
import { PushPullLegLogger } from './session-loggers/PushPullLegLogger';
import { CardioLogger } from './session-loggers/CardioLogger';
import { RestLogger } from './session-loggers/RestLogger';
import { FullBodyLogger } from './session-loggers/FullBodyLogger';
import { CompletionTracker } from './CompletionTracker';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

type SessionLoggerProps = {
  plan: PlanDay & { repeatWeekly?: boolean };
  onEnd: () => void;
};

export function SessionLogger({ plan, onEnd }: SessionLoggerProps) {
  const [isCompleting, setIsCompleting] = useState(false);

  const renderLogger = () => {
    switch (plan.bodyPart) {
      case 'Push':
      case 'Pull':
      case 'Legs':
        return <PushPullLegLogger bodyPart={plan.bodyPart} onEnd={onEnd} />;
      case 'Cardio':
        return <CardioLogger onEnd={onEnd} />;
      case 'Rest':
        return <RestLogger onEnd={onEnd} />;
      case 'Full Body':
        return <FullBodyLogger onEnd={onEnd} />;
      default:
        return <div>Unknown session type: {plan.bodyPart}</div>;
    }
  };

  if (isCompleting) {
    return (
      <div className="flex flex-col h-screen">
        <TopBar title="Complete Workout" onClose={() => setIsCompleting(false)} />
        <div className="flex-1 overflow-auto">
          <CompletionTracker plan={plan} onComplete={onEnd} />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar title={`${plan.bodyPart} Session`} onClose={onEnd} />
      <div className="flex-1 overflow-auto py-4 pb-24">
        {renderLogger()}
        
        <div className="fixed bottom-20 left-0 right-0 p-4 flex justify-center">
          <Button 
            onClick={() => setIsCompleting(true)} 
            className="px-8 py-6 rounded-full bg-green-600 hover:bg-green-700 text-white"
          >
            <Check className="mr-2 h-6 w-6" />
            Complete Workout
          </Button>
        </div>
      </div>
      <BottomNav />
    </div>
  );
}
