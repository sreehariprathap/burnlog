// components/UsernameSearchInput.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/apiFetch';

interface UserSuggestion {
  id: string;
  username: string;
  firstName: string;
  avatarUrl: string | null;
}

interface UsernameSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (user: UserSuggestion) => void;
  placeholder?: string;
  id?: string;
}

/** Reusable "invite by username" input with live suggestions, shared by
 * every invite-by-username flow (HomeLog, TravelLog, LearnLog). */
export function UsernameSearchInput({ value, onChange, onSelect, placeholder = 'username', id }: UsernameSearchInputProps) {
  const [suggestions, setSuggestions] = useState<UserSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(value.trim())}`);
      if (!cancelled) {
        if (res.ok) {
          const body = await res.json();
          setSuggestions(body.results ?? []);
          setOpen(true);
        }
        setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(user: UserSuggestion) {
    onChange(user.username);
    onSelect?.(user);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative flex-1">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (loading || suggestions.length > 0) && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-56 overflow-y-auto">
          {loading && suggestions.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
          )}
          {suggestions.map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => handleSelect(u)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Avatar className="h-6 w-6">
                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.username} />}
                <AvatarFallback className="text-[10px]">{u.firstName?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="font-medium">@{u.username}</span>
              <span className="text-muted-foreground">{u.firstName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
