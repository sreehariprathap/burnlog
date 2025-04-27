/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type FullBodyLoggerProps = { onEnd: () => void };

const fullBodyExercises: Record<string,string[]> = {
    Chest: ['Push-Ups', 'Bench Press', 'Chest Fly'],
    Back: ['Pull-Ups', 'Row', 'Lat Pulldown'],
    Shoulders: ['Overhead Press', 'Lateral Raise', 'Face Pull'],
    Biceps: ['Curl', 'Hammer Curl', 'Preacher Curl'],
    Triceps: ['Dip', 'Tricep Extension', 'Close-Grip Push Up'],
    Quads: ['Squat', 'Leg Press', 'Lunges'],
    Hamstrings: ['Deadlift', 'Leg Curl', 'Romanian Deadlift'],
    Calves: ['Calf Raise', 'Seated Calf Raise', 'Jump Rope'],
    Core: ['Plank', 'Crunch', 'Russian Twist']
};

export function FullBodyLogger({ onEnd }: FullBodyLoggerProps) {
    const groups = Object.keys(fullBodyExercises);
    const [checks, setChecks] = useState<Record<string,Record<string,boolean>>>(() => {
        const init: any = {};
        groups.forEach(g => {
            init[g] = {};
            fullBodyExercises[g].forEach(ex => (init[g][ex] = false));
        });
        return init;
    });

    // Only require at least one exercise done per group
    const groupDone = groups.map(g =>
        Object.values(checks[g]).some(v => v)
    );
    const sessionSuccess = groupDone.every(Boolean);

    return (
        <div className="p-4">
            <Card>
                <CardHeader>
                    <CardTitle>Full Body Session</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                    {groups.map((group, i) => (
                        <div key={group} className="mb-6">
                            <Label className="font-semibold text-lg mb-2 block">
                                {group} {groupDone[i] && '✅'}
                            </Label>
                            <div className="grid grid-cols-2 gap-4 mt-2">
                                {fullBodyExercises[group].map(ex => (
                                    <label key={ex} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded">
                                        <Checkbox
                                            checked={checks[group][ex]}
                                            onCheckedChange={val => {
                                                setChecks(prev => ({
                                                    ...prev,
                                                    [group]: { ...prev[group], [ex]: !!val }
                                                }));
                                            }}
                                        />
                                        <span className={checks[group][ex] ? 'line-through' : ''}>{ex}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}

                    <div className="flex justify-end mt-6">
                        <Button onClick={onEnd} disabled={!sessionSuccess}>
                            Finish Full Body
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
