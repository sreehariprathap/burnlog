'use client';

import { useEffect, useState } from 'react';
import { Plus, Utensils, Dumbbell, Footprints } from 'lucide-react';
import { RadialMenu } from '@/components/kokonutui/radial-menu';
import { LogCaloriesModal } from './quick-log/LogCaloriesModal';
import { LogWorkoutModal } from './quick-log/LogWorkoutModal';
import { LogStepsModal } from './quick-log/LogStepsModal';
import { WalkTrackerModal } from './quick-log/WalkTrackerModal';

type QuickLogFabProps = {
  profileId: string;
  onLogged: () => void;
};

type ModalKey = 'calories' | 'workout' | 'steps' | 'walk' | null;

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

  const items = [
    { key: 'calories', label: 'Calories', icon: <Utensils className="w-5 h-5" />, onSelect: () => { setMenuOpen(false); setOpen('calories'); } },
    { key: 'workout', label: 'Workout', icon: <Dumbbell className="w-5 h-5" />, onSelect: () => { setMenuOpen(false); setOpen('workout'); } },
    { key: 'steps', label: 'Steps', icon: <Footprints className="w-5 h-5" />, onSelect: () => { setMenuOpen(false); setOpen('steps'); } },
    { key: 'walk', label: 'Walk', icon: <Footprints className="w-5 h-5" />, onSelect: () => { setMenuOpen(false); setOpen('walk'); } },
  ];

  return (
    <>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="fixed bottom-20 right-4 z-30 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 transition-opacity"
        aria-label="Quick log"
        aria-expanded={menuOpen}
      >
        <Plus className="h-6 w-6" />
      </button>

      <RadialMenu open={menuOpen} items={items} onClose={() => setMenuOpen(false)} />

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
