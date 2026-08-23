'use client';
import React from 'react';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getExerciseImage } from '@/lib/exerciseImages';
import { getExerciseInstructions } from '@/lib/exerciseInstructions';

type ExerciseInfoModalProps = {
  exerciseName: string | null;
  onClose: () => void;
};

export function ExerciseInfoModal({ exerciseName, onClose }: ExerciseInfoModalProps) {
  return (
    <Dialog open={exerciseName !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {exerciseName && (
          <>
            <DialogHeader>
              <DialogTitle>{exerciseName}</DialogTitle>
            </DialogHeader>
            <div className="flex justify-center">
              <Image
                src={getExerciseImage(exerciseName)}
                alt={exerciseName}
                width={120}
                height={120}
                className="rounded-md"
              />
            </div>
            <ol className="list-decimal list-inside space-y-2 mt-2">
              {getExerciseInstructions(exerciseName).map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
