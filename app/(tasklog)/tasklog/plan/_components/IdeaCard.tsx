// app/(tasklog)/tasklog/plan/_components/IdeaCard.tsx
'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IDEA_CATEGORIES, type IdeaRow } from '@/lib/tasklog/types';

interface IdeaCardProps {
  idea: IdeaRow;
  taskCount: number;
  onGeneratePlan: (idea: IdeaRow) => void;
  onDelete: (ideaId: string) => void;
  deleting?: boolean;
}

export function IdeaCard({ idea, taskCount, onGeneratePlan, onDelete, deleting }: IdeaCardProps) {
  const categoryLabel = IDEA_CATEGORIES.find((c) => c.id === idea.category)?.label ?? idea.category;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{idea.title}</p>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{categoryLabel}</span>
        </div>
        {idea.plan && (
          <p className="text-xs text-muted-foreground">
            Planned · {taskCount} task{taskCount === 1 ? '' : 's'}
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => onGeneratePlan(idea)}>
            {idea.plan ? 'Regenerate plan' : 'Generate plan'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Delete idea "${idea.title}"`}
            onClick={() => onDelete(idea.id)}
            disabled={deleting}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
