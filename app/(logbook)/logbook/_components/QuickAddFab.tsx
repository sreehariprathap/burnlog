'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Plus, Flame, ListChecks, Wallet, Moon, ChevronLeft, Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '@/lib/financeCategories';

type QuickAddOption = 'meal' | 'task' | 'expense' | 'sleep';

interface QuickAddFabProps {
  profileId: string;
  onSaved: () => void;
}

const OPTIONS: { id: QuickAddOption; label: string; app: string; icon: LucideIcon; color: string; available: boolean }[] = [
  { id: 'meal', label: 'Log Meal', app: 'burnlog', icon: Flame, color: '#F97316', available: true },
  { id: 'task', label: 'Complete Task', app: 'tasklog', icon: ListChecks, color: '#3B82F6', available: true },
  { id: 'expense', label: 'Log Expense', app: 'moneylog', icon: Wallet, color: '#22C55E', available: true },
  { id: 'sleep', label: 'Log Sleep', app: 'lifelog', icon: Moon, color: '#8B5CF6', available: false },
];

function MealForm({ profileId, onSaved, onCancel }: { profileId: string; onSaved: () => void; onCancel: () => void }) {
  const supabase = createClientComponentClient();
  const [mealType, setMealType] = useState('lunch');
  const [foodName, setFoodName] = useState('');
  const [calories, setCalories] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!foodName.trim()) return setError('Enter a food name');
    if (!calories || isNaN(Number(calories))) return setError('Enter valid calories');

    setSaving(true);
    const { error: insertError } = await supabase
      .from('food_intakes')
      .insert([{ profileId, mealType, foodName: foodName.trim(), calories: Number(calories) }]);
    setSaving(false);
    if (insertError) return setError(insertError.message);
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {['breakfast', 'lunch', 'dinner', 'snack'].map((m) => (
          <Button
            key={m}
            type="button"
            size="sm"
            variant={mealType === m ? 'default' : 'outline'}
            onClick={() => setMealType(m)}
            className="capitalize"
          >
            {m}
          </Button>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label>Food</Label>
        <Input value={foodName} onChange={(e) => setFoodName(e.target.value)} placeholder="e.g. Chicken salad" />
      </div>
      <div className="space-y-1.5">
        <Label>Calories</Label>
        <Input type="number" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="e.g. 450" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Back</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function TaskForm({ profileId, onSaved, onCancel }: { profileId: string; onSaved: () => void; onCancel: () => void }) {
  const supabase = createClientComponentClient();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) return setError('Enter a task title');

    setSaving(true);
    const { error: insertError } = await supabase
      .from('tasklog_tasks')
      .insert([{ profileId, title: title.trim(), completedAt: new Date().toISOString() }]);
    setSaving(false);
    if (insertError) return setError(insertError.message);
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>What did you finish?</Label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Send project update" />
      </div>
      <p className="text-xs text-muted-foreground">Logs it straight to done — no need to plan it first.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Back</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark done'}
        </Button>
      </div>
    </div>
  );
}

function ExpenseForm({ profileId, onSaved, onCancel }: { profileId: string; onSaved: () => void; onCancel: () => void }) {
  const supabase = createClientComponentClient();
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0].value);
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  const handleTypeChange = (next: 'income' | 'expense') => {
    setType(next);
    setCategory(next === 'income' ? INCOME_CATEGORIES[0].value : EXPENSE_CATEGORIES[0].value);
  };

  const handleSave = async () => {
    setError(null);
    if (!label.trim()) return setError('Enter a label');
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return setError('Enter a valid amount');

    setSaving(true);
    const { error: insertError } = await supabase.from('finance_transactions').insert([
      { profileId, type, category, label: label.trim(), amount: Number(amount), date: new Date().toISOString() },
    ]);
    setSaving(false);
    if (insertError) return setError(insertError.message);
    onSaved();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" variant={type === 'expense' ? 'default' : 'outline'} onClick={() => handleTypeChange('expense')}>
          Expense
        </Button>
        <Button type="button" size="sm" variant={type === 'income' ? 'default' : 'outline'} onClick={() => handleTypeChange('income')}>
          Income
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <select
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Label</Label>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Groceries" />
      </div>
      <div className="space-y-1.5">
        <Label>Amount (₹)</Label>
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500" />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" className="flex-1" onClick={onCancel}>Back</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
        </Button>
      </div>
    </div>
  );
}

function SleepComingSoon({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-dashed p-4 text-center">
        <Moon className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">Sleep logging is coming soon</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Lifelog isn&apos;t built yet, so there&apos;s nowhere to save this yet — check back later.
        </p>
      </div>
      <Button variant="outline" className="w-full" onClick={onCancel}>Back</Button>
    </div>
  );
}

const SAVED_MESSAGES: Record<QuickAddOption, string> = {
  meal: 'Meal logged',
  task: 'Task marked done',
  expense: 'Expense logged',
  sleep: 'Sleep logged',
};

export function QuickAddFab({ profileId, onSaved }: QuickAddFabProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<QuickAddOption | null>(null);
  const { toast } = useToast();

  const close = () => {
    setOpen(false);
    setSelected(null);
  };

  const handleSaved = () => {
    if (selected) {
      toast({ description: SAVED_MESSAGES[selected] });
    }
    onSaved();
    close();
  };

  const selectedOption = OPTIONS.find((o) => o.id === selected);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        className="fixed bottom-24 right-4 z-20 h-14 w-14 rounded-full shadow-lg"
        aria-label="Quick add"
      >
        <Plus className="h-6 w-6" />
      </Button>

      <Drawer open={open} onOpenChange={(isOpen) => !isOpen && close()}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              {selectedOption && (
                <button onClick={() => setSelected(null)} aria-label="Back" className="text-muted-foreground">
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}
              {selectedOption ? selectedOption.label : 'Quick add'}
            </DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-6">
            {!selectedOption && (
              <div className="grid grid-cols-2 gap-3">
                {OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setSelected(opt.id)}
                      className="flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-transform active:scale-[0.98]"
                    >
                      <span
                        className="flex h-10 w-10 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${opt.color}1a` }}
                      >
                        <Icon className="h-5 w-5" style={{ color: opt.color }} />
                      </span>
                      <span className="text-sm font-medium">{opt.label}</span>
                      {!opt.available && <span className="text-[10px] text-muted-foreground">Coming soon</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {selected === 'meal' && <MealForm profileId={profileId} onSaved={handleSaved} onCancel={() => setSelected(null)} />}
            {selected === 'task' && <TaskForm profileId={profileId} onSaved={handleSaved} onCancel={() => setSelected(null)} />}
            {selected === 'expense' && <ExpenseForm profileId={profileId} onSaved={handleSaved} onCancel={() => setSelected(null)} />}
            {selected === 'sleep' && <SleepComingSoon onCancel={() => setSelected(null)} />}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
