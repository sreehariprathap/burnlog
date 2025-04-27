'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type PushPullLegLoggerProps = {
    bodyPart: 'Push' | 'Pull' | 'Legs';
    onEnd: () => void;
};

const exercisesByMuscle: Record<string, Record<string,string[]>> = {
    Push: {
        Chest: ['Bench Press', 'Incline Press', 'Push Ups', 'Chest Fly', 'Dips', 'Decline Press'],
        Shoulders: ['Overhead Press', 'Lateral Raise', 'Front Raise', 'Reverse Fly', 'Upright Row'],
        Triceps: ['Pushdown', 'Overhead Extension', 'Dips', 'Skull Crushers', 'Close Grip Bench Press']
    },
    Pull: {
        Back: ['Pull-Ups', 'Bent-over Row', 'Lat Pulldown', 'Seated Row', 'Deadlift'],
        Biceps: ['Barbell Curl', 'Hammer Curl', 'Preacher Curl', 'Concentration Curl', 'Cable Curl'],
        Forearms: ['Wrist Curl', 'Reverse Curl', 'Farmer\'s Walk', 'Plate Pinch', 'Grip Trainer']
    },
    Legs: {
        Quads: ['Squat', 'Leg Press', 'Lunge', 'Leg Extension', 'Hack Squat'],
        Hamstrings: ['Deadlift', 'Leg Curl', 'Good Morning', 'Romanian Deadlift', 'Glute Bridge'],
        Calves: ['Standing Calf Raise', 'Seated Calf Raise', 'Donkey Calf Raise', 'Leg Press Calf Raise', 'Jump Rope']
    }
};

export function PushPullLegLogger({ bodyPart, onEnd }: PushPullLegLoggerProps) {
    const muscles = Object.keys(exercisesByMuscle[bodyPart]);
    // checks[muscle][exercise] = boolean
    const [checks, setChecks] = useState<Record<string,Record<string,boolean>>>(() => {
        const init: any = {};
        muscles.forEach(m => {
            init[m] = {};
            exercisesByMuscle[bodyPart][m].forEach(ex => {
                init[m][ex] = false;
            });
        });
        return init;
    });

    // count how many done per muscle
    const muscleDone = muscles.map(m => {
        const done = Object.values(checks[m]).filter(v => v).length;
        return done >= 3;
    });
    const sessionSuccess = muscleDone.every(Boolean);

    return (
        <div className="p-6">
            <Card className="shadow-lg">
                <CardHeader className="pb-2">
                    <CardTitle className="text-2xl">{bodyPart} Session</CardTitle>
                </CardHeader>
                <CardContent className="space-y-8">
                    {muscles.map((muscle, i) => (
                        <div key={muscle} className="mb-6">
                            <Label className="text-lg font-semibold mb-3 flex items-center">
                                {muscle} {muscleDone[i] && <span className="ml-2 text-green-500">✅</span>}
                            </Label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                {exercisesByMuscle[bodyPart][muscle].map(ex => (
                                    <label key={ex} className="flex items-center space-x-3 p-2 hover:bg-slate-50 rounded-md">
                                        <Checkbox
                                            checked={checks[muscle][ex]}
                                            onCheckedChange={val => {
                                                setChecks(prev => ({
                                                    ...prev,
                                                    [muscle]: { ...prev[muscle], [ex]: !!val }
                                                }));
                                            }}
                                            className="h-5 w-5"
                                        />
                                        <span className={checks[muscle][ex] ? 'line-through opacity-70' : ''}>{ex}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}

                    <div className="flex justify-end pt-4 mt-6">
                        <Button 
                            onClick={onEnd} 
                            disabled={!sessionSuccess} 
                            className="px-6 py-2"
                        >
                            {sessionSuccess ? 'Finish Session 🎉' : 'Complete 3 per muscle'}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
