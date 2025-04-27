// components/SessionLogger.tsx
'use client';

import React from 'react';
import { PlanDay } from './PlanCard';
import { PushPullLegLogger } from './session-loggers/PushPullLegLogger';
import { CardioLogger }         from './session-loggers/CardioLogger';
import { RestLogger }           from './session-loggers/RestLogger';
import { FullBodyLogger }       from './session-loggers/FullBodyLogger';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';

type SessionLoggerProps = {
  plan: PlanDay & { repeatWeekly?: boolean };
  onEnd: () => void;
};

export function SessionLogger({ plan, onEnd }: SessionLoggerProps) {
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

  return (
    <div className="flex flex-col h-screen ">
      <TopBar title={`${plan.bodyPart} Session`} />
      <div className="flex-1 overflow-auto py-4 pb-10">
        {renderLogger()}
      </div>
      <BottomNav />
    </div>
  );
}
