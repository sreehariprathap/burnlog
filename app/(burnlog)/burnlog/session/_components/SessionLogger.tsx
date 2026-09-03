// components/SessionLogger.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PlanDay } from './PlanCard';
import { PushPullLegLogger } from './session-loggers/PushPullLegLogger';
import { CardioLogger } from './session-loggers/CardioLogger';
import { RestLogger } from './session-loggers/RestLogger';
import { FullBodyLogger } from './session-loggers/FullBodyLogger';
import { BodyweightLogger } from './session-loggers/BodyweightLogger';
import { OutdoorCardioLogger } from './session-loggers/OutdoorCardioLogger';
import { ActiveCommuteLogger } from './session-loggers/ActiveCommuteLogger';
import { CompletionTracker } from './CompletionTracker';
import { TopBar } from '@/components/TopBar';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import type { LifestyleAnswers } from '@/lib/ai/types';

type WorkoutTemplate = {
  id: string;
  name: string;
  exercises: Record<string, Record<string, boolean>>;
};

type SessionLoggerProps = {
  plan: PlanDay & { repeatWeekly?: boolean };
  profileId?: string | null;
  lifestyle?: LifestyleAnswers | null;
  onEnd: () => void;
};

export function SessionLogger({ plan, profileId, lifestyle, onEnd }: SessionLoggerProps) {
  const userEquipment = lifestyle?.equipment?.availableEquipment ?? [];
  const [isCompleting, setIsCompleting] = useState(false);
  const [exerciseLog, setExerciseLog] = useState<Record<string, unknown> | null>(null);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkoutTemplate | null>(null);
  const isTemplatable = plan.bodyPart === 'Push' || plan.bodyPart === 'Pull' || plan.bodyPart === 'Legs';

  useEffect(() => {
    if (!profileId || !isTemplatable) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('workout_templates')
        .select('id,name,exercises')
        .eq('profileId', profileId)
        .eq('bodyPart', plan.bodyPart)
        .order('useCount', { ascending: false })
        .limit(6);
      setTemplates((data as WorkoutTemplate[]) ?? []);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, plan.bodyPart]);

  const handleLoggerEnd = (log: Record<string, unknown>) => {
    setExerciseLog(log);
    setIsCompleting(true);
  };

  const renderLogger = () => {
    switch (plan.bodyPart) {
      case 'Push':
      case 'Pull':
      case 'Legs':
        return (
          <PushPullLegLogger
            key={selectedTemplate?.id ?? 'blank'}
            bodyPart={plan.bodyPart}
            userEquipment={userEquipment}
            initialChecks={selectedTemplate?.exercises}
            onEnd={handleLoggerEnd}
          />
        );
      case 'Cardio':
        return <CardioLogger onEnd={handleLoggerEnd} />;
      case 'Rest':
        return <RestLogger onEnd={handleLoggerEnd} />;
      case 'Full Body':
        return <FullBodyLogger userEquipment={userEquipment} onEnd={handleLoggerEnd} />;
      case 'Bodyweight':
        return <BodyweightLogger userEquipment={userEquipment} onEnd={handleLoggerEnd} />;
      case 'Outdoor Cardio':
        return <OutdoorCardioLogger lifestyle={lifestyle} onEnd={handleLoggerEnd} />;
      case 'Active Commute':
        return <ActiveCommuteLogger commuteDetails={lifestyle?.commuteDetails} onEnd={handleLoggerEnd} />;
      default:
        return <div>Unknown session type: {plan.bodyPart}</div>;
    }
  };

  if (isCompleting) {
    return (
      <div className="flex flex-col h-screen">
        <TopBar title="Complete Workout" onClose={() => setIsCompleting(false)} />
        <div className="flex-1 overflow-auto pb-20">
          <CompletionTracker plan={plan} exerciseLog={exerciseLog} onComplete={onEnd} />
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <TopBar title={`${plan.bodyPart} Session`} onClose={onEnd} />
      <div className="flex-1 overflow-auto py-4 pb-24">
        {templates.length > 0 && (
          <div className="px-6 mb-4 space-y-1">
            <p className="text-xs text-muted-foreground">Start from a saved workout</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedTemplate(template)}
                  className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                    selectedTemplate?.id === template.id
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted'
                  }`}
                >
                  {template.name}
                </button>
              ))}
            </div>
          </div>
        )}
        {renderLogger()}
        
        <div className="fixed bottom-20 left-0 right-0 p-4 flex justify-center">
          <Button 
            onClick={() => setIsCompleting(true)} 
            className="px-8 py-6 rounded-full bg-success hover:bg-success/90 text-white"
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
