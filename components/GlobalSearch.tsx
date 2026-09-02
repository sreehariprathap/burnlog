// components/GlobalSearch.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { APPS, getActiveApp } from '@/lib/appMode';
import { useAppSwitch } from '@/lib/appSwitchContext';
import { SEARCH_REGISTRY, appSearchColor, type SearchItem } from '@/lib/search/registry';

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

interface GlobalSearchProps {
  /** Called after navigating to a result — e.g. to close a parent drawer. */
  onNavigate?: () => void;
  placeholder?: string;
}

/**
 * Cross-app search: find any major page/feature across every sub-app and
 * jump straight to it. Self-contained (owns its own query state) so it
 * drops cleanly into HeaderQuickInfo's drawer or directly onto a page —
 * renders nothing below the input until there's a query.
 */
export function GlobalSearch({ onNavigate, placeholder }: GlobalSearchProps) {
  const router = useRouter();
  const { switchTo } = useAppSwitch();
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const debouncedQuery = useDebounce(query, 150);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return [];
    return SEARCH_REGISTRY.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        APPS[item.app].name.toLowerCase().includes(q)
    );
  }, [debouncedQuery]);

  useEffect(() => {
    setHighlighted(0);
  }, [debouncedQuery]);

  function goTo(item: SearchItem) {
    setQuery('');
    onNavigate?.();
    // Jumping into a different app: go through switchTo so the app-switch
    // loader plays and app-scoped storage/theme get reset, same as using
    // the app switcher. Staying within the current app is a plain nav.
    if (getActiveApp() !== item.app) {
      switchTo(item.app, item.href);
    } else {
      router.push(item.href);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[highlighted];
      if (item) goTo(item);
    } else if (e.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border bg-muted px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Search anything across every app…'}
          className="border-none bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {debouncedQuery.trim() !== '' && (
        <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="p-3 text-center text-sm text-muted-foreground">No matching pages</p>
          )}
          {filtered.map((item, index) => {
            const Icon = item.icon;
            const color = appSearchColor(item.app);
            return (
              <button
                key={`${item.app}-${item.href}`}
                type="button"
                onClick={() => goTo(item)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors',
                  index === highlighted ? 'bg-accent' : 'hover:bg-accent/50'
                )}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${color}1a` }}
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5 font-medium">
                    {item.label}
                    <span className="text-xs font-normal text-muted-foreground">· {APPS[item.app].name}</span>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
