'use client';

import { useState } from 'react';
import SiriOrb from '@/components/smoothui/siri-orb';
import { Button } from '@/components/ui/button';
import { APPS, type AppId } from '@/lib/appMode';
import type { HabitEndType, HabitRecurrenceType } from '@/lib/habits/habitRecurrence';

interface HabitCreateSheetProps {
  date: string;
  onClose: () => void;
  onSaved: () => void;
}

interface ClassifyResult {
  title: string;
  sourceApp: AppId | null;
  isRecurring: boolean;
  suggestedRecurrence?: { daysOfWeek?: number[]; intervalWeeks?: number };
}

type Step =
  | { step: 'capture' }
  | { step: 'confirm'; result: ClassifyResult }
  | { step: 'recurrence'; result: ClassifyResult };

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_PRESET = [1, 2, 3, 4, 5]; // Mon-Fri

export function HabitCreateSheet({ date, onClose, onSaved }: HabitCreateSheetProps) {
  const [state, setState] = useState<Step>({ step: 'capture' });
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);

  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(WEEKDAY_PRESET);
  const [intervalWeeks, setIntervalWeeks] = useState(1);
  const [endType, setEndType] = useState<HabitEndType>('never');
  const [endDate, setEndDate] = useState('');
  const [endCount, setEndCount] = useState(10);

  async function handleCapture() {
    if (!text.trim()) return;
    setThinking(true);
    try {
      const res = await fetch('/api/ai/classify-habit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      const result: ClassifyResult = res.ok
        ? await res.json()
        : { title: text.trim(), sourceApp: null, isRecurring: false };
      if (result.suggestedRecurrence?.daysOfWeek) setDaysOfWeek(result.suggestedRecurrence.daysOfWeek);
      if (result.suggestedRecurrence?.intervalWeeks) setIntervalWeeks(result.suggestedRecurrence.intervalWeeks);
      setState({ step: 'confirm', result });
    } catch {
      setState({ step: 'confirm', result: { title: text.trim(), sourceApp: null, isRecurring: false } });
    } finally {
      setThinking(false);
    }
  }

  async function handleCreate(result: ClassifyResult, recurrenceType: HabitRecurrenceType) {
    setSaving(true);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: result.title,
          sourceApp: result.sourceApp,
          recurrenceType,
          daysOfWeek: recurrenceType === 'weekly' ? daysOfWeek : [],
          intervalWeeks,
          endType: recurrenceType === 'weekly' ? endType : 'never',
          endDate: recurrenceType === 'weekly' && endType === 'on_date' ? endDate : null,
          endCount: recurrenceType === 'weekly' && endType === 'after_n' ? endCount : null,
          startDate: date,
        }),
      });
      if (!res.ok) throw new Error('Failed to create habit');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  function toggleDay(day: number) {
    setDaysOfWeek((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full rounded-t-2xl bg-background p-4" onClick={(e) => e.stopPropagation()}>
        {state.step === 'capture' && (
          <div className="flex flex-col items-center gap-4 py-6">
            <SiriOrb state={thinking ? 'thinking' : 'idle'} size="72px" />
            <textarea
              className="w-full rounded-lg border p-3 text-sm"
              placeholder="What habit do you want to build?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
            />
            <Button onClick={handleCapture} disabled={thinking || !text.trim()} className="w-full">
              {thinking ? 'Thinking…' : 'Continue'}
            </Button>
          </div>
        )}

        {state.step === 'confirm' && (
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold">{state.result.title}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(APPS) as AppId[]).map((appId) => (
                <button
                  key={appId}
                  type="button"
                  onClick={() => setState({ step: 'confirm', result: { ...state.result, sourceApp: appId } })}
                  className={`rounded-full border px-3 py-1 text-xs ${state.result.sourceApp === appId ? 'border-foreground' : ''}`}
                >
                  {APPS[appId].name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setState({ step: 'confirm', result: { ...state.result, sourceApp: null } })}
                className={`rounded-full border px-3 py-1 text-xs ${state.result.sourceApp === null ? 'border-foreground' : ''}`}
              >
                General
              </button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleCreate(state.result, 'once')} disabled={saving} className="flex-1">
                One-time
              </Button>
              <Button onClick={() => setState({ step: 'recurrence', result: state.result })} className="flex-1">
                Recurring
              </Button>
            </div>
          </div>
        )}

        {state.step === 'recurrence' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Repeat on</p>
              <div className="flex gap-1">
                {WEEKDAY_LABELS.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`h-9 w-9 rounded-full border text-xs ${daysOfWeek.includes(day) ? 'bg-foreground text-background' : ''}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" className="self-start text-xs underline" onClick={() => setDaysOfWeek([0, 1, 2, 3, 4, 5, 6])}>
                  Every day
                </button>
                <button type="button" className="self-start text-xs underline" onClick={() => setDaysOfWeek(WEEKDAY_PRESET)}>
                  Weekdays
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              Every
              <input
                type="number"
                min={1}
                value={intervalWeeks}
                onChange={(e) => setIntervalWeeks(Math.max(1, Number(e.target.value)))}
                className="w-14 rounded border p-1 text-center"
              />
              week(s)
            </label>

            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">Ends</p>
              <div className="flex gap-3">
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={endType === 'never'} onChange={() => setEndType('never')} /> Never
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={endType === 'on_date'} onChange={() => setEndType('on_date')} /> On date
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" checked={endType === 'after_n'} onChange={() => setEndType('after_n')} /> After N times
                </label>
              </div>
              {endType === 'on_date' && (
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded border p-1 text-sm" />
              )}
              {endType === 'after_n' && (
                <input
                  type="number"
                  min={1}
                  value={endCount}
                  onChange={(e) => setEndCount(Math.max(1, Number(e.target.value)))}
                  className="w-20 rounded border p-1 text-sm"
                />
              )}
            </div>

            <Button onClick={() => handleCreate(state.result, 'weekly')} disabled={saving || daysOfWeek.length === 0} className="w-full">
              {saving ? 'Creating…' : 'Create habit'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
