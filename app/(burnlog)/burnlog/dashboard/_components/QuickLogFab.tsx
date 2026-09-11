'use client';

import { useEffect, useState } from 'react';
import { Plus, Utensils, Dumbbell, Footprints, Route, type LucideIcon } from 'lucide-react';
import { ThemedButton } from '@/components/ui/themed-button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { LogCaloriesModal } from './quick-log/LogCaloriesModal';
import { LogWorkoutModal } from './quick-log/LogWorkoutModal';
import { LogStepsModal } from './quick-log/LogStepsModal';
import { WalkTrackerModal } from './quick-log/WalkTrackerModal';

type QuickLogFabProps = {
  profileId: string;
  onLogged: () => void;
};

type ModalKey = 'calories' | 'workout' | 'steps' | 'walk' | null;

const OPTIONS: { key: NonNullable<ModalKey>; label: string; icon: LucideIcon }[] = [
  { key: 'calories', label: 'Calories', icon: Utensils },
  { key: 'workout', label: 'Workout', icon: Dumbbell },
  { key: 'steps', label: 'Steps', icon: Footprints },
  { key: 'walk', label: 'Walk', icon: Route },
];

export function QuickLogFab({ profileId, onLogged, initialOpen }: QuickLogFabProps & { initialOpen?: ModalKey }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [open, setOpen] = useState<ModalKey>(null);

  useEffect(() => {
    if (initialOpen) setOpen(initialOpen);
  }, [initialOpen]);

  const handleSaved = () => {
    setOpen(null);
    onLogged();
  };

  const selectOption = (key: NonNullable<ModalKey>) => {
    setMenuOpen(false);
    setOpen(key);
  };

  return (
    <>
      <ThemedButton
        slot="fab"
        onClick={() => setMenuOpen(true)}
        className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Quick log"
        aria-expanded={menuOpen}
      >
        <Plus className="h-6 w-6" />
      </ThemedButton>

      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent className="max-h-[80vh]">
          <DrawerHeader>
            <DrawerTitle>Quick log</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-3 px-4 pb-6 overflow-y-auto">
            {OPTIONS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => selectOption(key)}
                className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center outline-none transition-transform active:scale-[0.98] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>

      {open === 'calories' && (
        <LogCaloriesModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'workout' && (
        <LogWorkoutModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'steps' && (
        <LogStepsModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
      {open === 'walk' && (
        <WalkTrackerModal profileId={profileId} onClose={() => setOpen(null)} onSaved={handleSaved} />
      )}
    </>
  );
}
