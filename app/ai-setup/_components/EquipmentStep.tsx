// app/ai-setup/_components/EquipmentStep.tsx
'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EQUIPMENT_OPTIONS, type EquipmentAnswers } from '@/lib/ai/types';

type EquipmentStepProps = {
  onContinue: (answers: EquipmentAnswers) => void;
  onSkip: () => void;
};

export function EquipmentStep({ onContinue, onSkip }: EquipmentStepProps) {
  const [trainingLocation, setTrainingLocation] = useState<EquipmentAnswers['trainingLocation']>('mixed');
  const [availableEquipment, setAvailableEquipment] = useState<string[]>([]);

  const toggle = (value: string) => {
    setAvailableEquipment((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Where do you train?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Training location</Label>
          <Select
            value={trainingLocation}
            onValueChange={(v) => setTrainingLocation(v as EquipmentAnswers['trainingLocation'])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="commercial_gym">Commercial gym</SelectItem>
              <SelectItem value="home_gym">Home gym</SelectItem>
              <SelectItem value="bodyweight_only">Bodyweight only</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Available equipment</Label>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT_OPTIONS.map((opt) => (
              <label key={opt} className="flex items-center space-x-2">
                <Checkbox
                  checked={availableEquipment.includes(opt)}
                  onCheckedChange={() => toggle(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="ghost" onClick={onSkip}>Skip</Button>
          <Button
            type="button"
            onClick={() => onContinue({ trainingLocation, availableEquipment })}
          >
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
