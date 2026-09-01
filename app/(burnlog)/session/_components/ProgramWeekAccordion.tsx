// app/(burnlog)/session/_components/ProgramWeekAccordion.tsx
'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';

export type ProgramWeekRow = {
  id: string;
  weekIndex: number;
  title: string;
  subtitle: string | null;
  socialActivity: string | null;
  soloActivity: string | null;
  checklist: { label: string; checked: boolean }[];
  milestoneAwarded: boolean;
};

type ProgramWeekAccordionProps = {
  week: ProgramWeekRow;
  onWeekUpdated: (week: ProgramWeekRow) => void;
  onMilestone: (weekTitle: string) => void;
};

export function ProgramWeekAccordion({ week, onWeekUpdated, onMilestone }: ProgramWeekAccordionProps) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const checkedCount = week.checklist.filter((item) => item.checked).length;
  const { toast } = useToast();

  const handleToggle = async (itemIndex: number, checked: boolean) => {
    const newChecklist = week.checklist.map((item, i) => (i === itemIndex ? { ...item, checked } : item));
    const allChecked = newChecklist.every((item) => item.checked);
    const justCompleted = allChecked && !week.milestoneAwarded;

    const { error } = await supabase
      .from('program_weeks')
      .update({ checklist: newChecklist, ...(justCompleted ? { milestoneAwarded: true } : {}) })
      .eq('id', week.id);

    if (!error) {
      onWeekUpdated({ ...week, checklist: newChecklist, milestoneAwarded: week.milestoneAwarded || allChecked });
      if (justCompleted) onMilestone(week.title);
    } else {
      toast({
        title: 'Could not update checklist',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-muted font-semibold text-primary">
            W{week.weekIndex}
          </span>
          <div>
            <div className="font-semibold">{week.title}</div>
            {week.subtitle && <div className="text-xs text-muted-foreground">{week.subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {checkedCount}/{week.checklist.length}
          </span>
          <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
        </div>
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          {(week.socialActivity || week.soloActivity) && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {week.socialActivity && (
                <div className="rounded-lg border bg-[color:var(--chart-2)]/10 p-3 text-sm">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    With friends
                  </span>
                  {week.socialActivity}
                </div>
              )}
              {week.soloActivity && (
                <div className="rounded-lg border bg-[color:var(--chart-1)]/10 p-3 text-sm">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Solo
                  </span>
                  {week.soloActivity}
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {week.checklist.map((item, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <Checkbox checked={item.checked} onCheckedChange={(checked) => handleToggle(i, checked === true)} />
                <span className={cn(item.checked && 'text-muted-foreground line-through')}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
