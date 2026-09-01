// app/ai-setup/_components/EquipmentStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EQUIPMENT_OPTIONS, type EquipmentAnswers, type HomeEnvironment } from '@/lib/ai/types';

type EquipmentStepProps = {
  onContinue: (answers: EquipmentAnswers) => void;
  onSkip: () => void;
};

const GYM_EQUIPMENT = ['Dumbbells', 'Barbell', 'Resistance Bands', 'Pull-up Bar', 'Cardio Machine', 'Kettlebell'];
const HOME_EQUIPMENT = ['Yoga Mat', 'Jump Rope', 'Foam Roller', 'Parallette Bars', 'TRX / Suspension Trainer', 'None (bodyweight only)'];

export function EquipmentStep({ onContinue, onSkip }: EquipmentStepProps) {
  const [trainingLocation, setTrainingLocation] = useState<EquipmentAnswers['trainingLocation']>('mixed');
  const [availableEquipment, setAvailableEquipment] = useState<string[]>([]);
  const [hasOutdoorSpace, setHasOutdoorSpace] = useState(false);
  const [nearbyPark, setNearbyPark] = useState(false);
  const [spaceSize, setSpaceSize] = useState<HomeEnvironment['spaceSize']>('medium');

  const isHome = trainingLocation === 'home_gym' || trainingLocation === 'bodyweight_only';
  const isOutdoor = trainingLocation === 'outdoor';
  const showGymEquipment = trainingLocation === 'commercial_gym' || trainingLocation === 'mixed';
  const showHomeEquipment = isHome || trainingLocation === 'mixed';

  const toggle = (value: string) => {
    setAvailableEquipment((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleContinue = () => {
    const homeEnvironment: HomeEnvironment | undefined =
      isHome || trainingLocation === 'mixed'
        ? { hasOutdoorSpace, nearbyPark, spaceSize }
        : undefined;
    onContinue({ trainingLocation, availableEquipment, homeEnvironment });
  };

  return (
    <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
      <CardHeader>
        <CardTitle>Your training environment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Where do you primarily train?</Label>
          <Select
            value={trainingLocation}
            onValueChange={(v) => setTrainingLocation(v as EquipmentAnswers['trainingLocation'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="commercial_gym">🏋️ Commercial gym</SelectItem>
              <SelectItem value="home_gym">🏠 Home (with some equipment)</SelectItem>
              <SelectItem value="bodyweight_only">💪 Home (bodyweight only)</SelectItem>
              <SelectItem value="outdoor">🌳 Outdoor (parks, tracks)</SelectItem>
              <SelectItem value="mixed">🔀 Mixed / varies</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {showGymEquipment && (
          <div className="space-y-2">
            <Label>Gym equipment available</Label>
            <div className="grid grid-cols-2 gap-2">
              {GYM_EQUIPMENT.map((opt) => (
                <label key={opt} className="flex items-center space-x-2">
                  <Checkbox checked={availableEquipment.includes(opt)} onCheckedChange={() => toggle(opt)} />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {showHomeEquipment && (
          <div className="space-y-2">
            <Label>Home equipment available</Label>
            <div className="grid grid-cols-2 gap-2">
              {HOME_EQUIPMENT.map((opt) => (
                <label key={opt} className="flex items-center space-x-2">
                  <Checkbox checked={availableEquipment.includes(opt)} onCheckedChange={() => toggle(opt)} />
                  <span className="text-sm">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {(isHome || trainingLocation === 'mixed' || isOutdoor) && (
          <div className="space-y-3 border rounded-lg p-4 bg-muted/30">
            <p className="text-sm font-medium">Your space & surroundings</p>

            {(isHome || trainingLocation === 'mixed') && (
              <div className="space-y-2">
                <Label>Available workout space at home</Label>
                <Select value={spaceSize} onValueChange={(v) => setSpaceSize(v as HomeEnvironment['spaceSize'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (e.g. bedroom, limited floor space)</SelectItem>
                    <SelectItem value="medium">Medium (e.g. living room)</SelectItem>
                    <SelectItem value="large">Large (e.g. garage, open room)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <label className="flex items-center space-x-3">
              <Checkbox checked={hasOutdoorSpace} onCheckedChange={(v) => setHasOutdoorSpace(!!v)} />
              <span className="text-sm">I have a garden / balcony / outdoor space at home</span>
            </label>

            <label className="flex items-center space-x-3">
              <Checkbox checked={nearbyPark} onCheckedChange={(v) => setNearbyPark(!!v)} />
              <span className="text-sm">There&apos;s a park or open space within 10 min of me</span>
            </label>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button type="button" onClick={handleContinue}>Continue</Button>
        </div>
      </CardContent>
    </Card>
  );
}
