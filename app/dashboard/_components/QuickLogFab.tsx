'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LogCaloriesModal } from './quick-log/LogCaloriesModal';
import { LogWorkoutModal } from './quick-log/LogWorkoutModal';
import { LogStepsModal } from './quick-log/LogStepsModal';

type QuickLogFabProps = {
  profileId: string;
  onLogged: () => void;
};

type ModalKey = 'menu' | 'calories' | 'workout' | 'steps' | null;

export function QuickLogFab({ profileId, onLogged }: QuickLogFabProps) {
  const [open, setOpen] = useState<ModalKey>(null);

  const handleSaved = () => {
    setOpen(null);
    onLogged();
  };

  return (
    <>
      <button
        onClick={() => setOpen('menu')}
        className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Quick log"
      >
        <Plus className="h-6 w-6" />
      </button>

      <Dialog open={open === 'menu'} onOpenChange={(isOpen) => !isOpen && setOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Log</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            <Button variant="outline" className="justify-start" onClick={() => setOpen('calories')}>
              🍽️ Log Calories
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setOpen('workout')}>
              🏋️ Log Workout
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => setOpen('steps')}>
              🚶 Log Steps
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {open === 'calories' && (
        <LogCaloriesModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'workout' && (
        <LogWorkoutModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'steps' && (
        <LogStepsModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
    </>
  );
}
