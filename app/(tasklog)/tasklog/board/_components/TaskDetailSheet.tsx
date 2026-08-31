// app/(tasklog)/tasklog/board/_components/TaskDetailSheet.tsx
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRIORITIES, type TaskCategory, type TaskPriority, type TaskRow } from '@/lib/tasklog/types';

interface TaskDetailSheetProps {
  task: TaskRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, updates: Partial<TaskRow>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function TaskDetailSheet({ task, open, onOpenChange, onSave, onDelete }: TaskDetailSheetProps) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<TaskCategory>('work');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [titleError, setTitleError] = useState('');

  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setNotes(task.notes ?? '');
    setCategory(task.category);
    setPriority(task.priority);
    setDueDate(task.dueDate ?? '');
    setTitleError('');
  }, [task]);

  if (!task) return null;

  async function handleSave() {
    if (!task) return;
    if (!title.trim()) {
      setTitleError('Title is required');
      return;
    }
    setTitleError('');
    setSaving(true);
    try {
      await onSave(task.id, {
        title: title.trim(),
        notes: notes.trim() || null,
        category,
        priority,
        dueDate: dueDate || null,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleComplete() {
    if (!task) return;
    setSaving(true);
    try {
      await onSave(task.id, {
        completedAt: task.completedAt ? null : new Date().toISOString(),
        lane: task.completedAt ? task.lane : 'done',
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await onDelete(task.id);
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="task-detail-title">Title</Label>
            <Input
              id="task-detail-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError('');
              }}
              autoComplete="off"
              autoFocus
              aria-invalid={!!titleError}
              aria-describedby={titleError ? 'task-detail-title-error' : undefined}
            />
            {titleError && (
              <p id="task-detail-title-error" className="text-sm text-destructive">{titleError}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-detail-notes">Notes</Label>
            <Textarea id="task-detail-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="task-detail-category">Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as TaskCategory)}>
                <SelectTrigger id="task-detail-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="life">Life</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-detail-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger id="task-detail-priority"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-detail-due-date">Due date</Label>
            <Input id="task-detail-due-date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </form>
        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={saving || deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleToggleComplete} disabled={saving || deleting}>
              {task.completedAt ? 'Mark incomplete' : 'Mark complete'}
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || deleting}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
