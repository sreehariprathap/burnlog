// components/intellog/IntelChatPromptBar.tsx
'use client';

import { useRef, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { IntelChatModelPicker } from './IntelChatModelPicker';
import type { CuratedModelOption } from '@/lib/ai/curatedModels';

const MIN_HEIGHT_PX = 72;
const MAX_HEIGHT_PX = 300;

interface IntelChatPromptBarProps {
  models: CuratedModelOption[];
  selectedModel: string | null;
  onModelChange: (modelId: string) => void;
  onSend: (text: string) => void;
  disabled: boolean;
}

export function IntelChatPromptBar({ models, selectedModel, onModelChange, onSend, disabled }: IntelChatPromptBarProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = `${MIN_HEIGHT_PX}px`;
    el.style.height = `${Math.min(MAX_HEIGHT_PX, Math.max(MIN_HEIGHT_PX, el.scrollHeight))}px`;
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    requestAnimationFrame(resize);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t bg-background p-3">
      <div className="rounded-2xl border bg-muted/30 p-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your apps, or anything else…"
          style={{ minHeight: MIN_HEIGHT_PX, maxHeight: MAX_HEIGHT_PX }}
          className="w-full resize-none bg-transparent px-1 py-1 text-sm outline-none"
        />
        <div className="flex items-center justify-between px-1 pt-1">
          <IntelChatModelPicker models={models} selectedModel={selectedModel} onSelect={onModelChange} />
          <button
            type="button"
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label="Send message"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
          >
            <ArrowUpIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
