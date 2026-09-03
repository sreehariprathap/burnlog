// components/intellog/IntelChatModelPicker.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OpenRouterModel } from '@/lib/intellog/openrouterModels';

const MAX_VISIBLE_RESULTS = 50;

interface IntelChatModelPickerProps {
  models: OpenRouterModel[];
  /** null = no per-thread choice yet, falls back to the admin-configured default. */
  selectedModel: string | null;
  onSelect: (modelId: string) => void;
}

export function IntelChatModelPicker({ models, selectedModel, onSelect }: IntelChatModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedName = useMemo(() => {
    if (!selectedModel) return 'Default model';
    return models.find((m) => m.id === selectedModel)?.name ?? selectedModel;
  }, [models, selectedModel]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? models.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
      : models;
    return base.slice(0, MAX_VISIBLE_RESULTS);
  }, [models, query]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function selectAndClose(modelId: string) {
    onSelect(modelId);
    setOpen(false);
    setQuery('');
    setCustomMode(false);
    setCustomValue('');
  }

  function submitCustom(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = customValue.trim();
    if (!trimmed) return;
    selectAndClose(trimmed);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex max-w-[160px] items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="truncate">{selectedName}</span>
        <ChevronDownIcon className="h-3 w-3 shrink-0" />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border bg-popover p-2 shadow-lg">
          {customMode ? (
            <form onSubmit={submitCustom} className="flex flex-col gap-2">
              <input
                autoFocus
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder="e.g. mistralai/mixtral-8x7b"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setCustomMode(false)}>
                  Back
                </button>
                <button type="submit" className="font-medium text-primary" disabled={!customValue.trim()}>
                  Use this model
                </button>
              </div>
            </form>
          ) : (
            <>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                className="mb-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="max-h-56 overflow-y-auto">
                {filtered.length === 0 && (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching models</p>
                )}
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => selectAndClose(m.id)}
                    className={cn(
                      'flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                      m.id === selectedModel && 'bg-accent'
                    )}
                  >
                    <span className="truncate">{m.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{m.id}</span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCustomMode(true)}
                className="mt-2 w-full rounded-md border border-dashed px-2 py-1.5 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                Use custom model ID…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
