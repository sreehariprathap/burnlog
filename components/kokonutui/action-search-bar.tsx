// components/kokonutui/action-search-bar.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Flame,
  Dumbbell,
  Footprints,
  Scale,
  Target,
  LineChart,
  Cpu,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

type Action = {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  run: () => void;
};

type ActionSearchBarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onQuickLog: (key: "calories" | "workout" | "steps" | "walk") => void;
};

export function ActionSearchBar({ open, onOpenChange, isAdmin, onQuickLog }: ActionSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const debouncedQuery = useDebounce(query, 200);
  const inputRef = useRef<HTMLInputElement>(null);

  const allActions: Action[] = useMemo(
    () => [
      { id: "calories", label: "Log Calories", description: "Manual entry or AI photo scan", icon: <Flame className="h-4 w-4" />, run: () => onQuickLog("calories") },
      { id: "workout", label: "Log Workout", description: "Manual entry or AI calorie estimate", icon: <Dumbbell className="h-4 w-4" />, run: () => onQuickLog("workout") },
      { id: "steps", label: "Log Steps", description: "Manual step entry", icon: <Footprints className="h-4 w-4" />, run: () => onQuickLog("steps") },
      { id: "walk", label: "Start Walk", description: "Live step + duration tracking", icon: <Footprints className="h-4 w-4" />, run: () => onQuickLog("walk") },
      { id: "weight", label: "Track Weight", description: "Open the weight tracker", icon: <Scale className="h-4 w-4" />, run: () => router.push("/goals") },
      { id: "goals", label: "Set Goals", description: "Manage your fitness goals", icon: <Target className="h-4 w-4" />, run: () => router.push("/goals") },
      { id: "session", label: "Start Workout Session", description: "Today's planned session", icon: <Dumbbell className="h-4 w-4" />, run: () => router.push("/session") },
      { id: "insights", label: "View Insights", description: "Progress charts and trends", icon: <LineChart className="h-4 w-4" />, run: () => router.push("/insights") },
      ...(isAdmin
        ? [{ id: "ai-models", label: "Manage AI Models", description: "Admin: choose free OpenRouter models", icon: <Cpu className="h-4 w-4" />, run: () => router.push("/profile") }]
        : []),
    ],
    [isAdmin, onQuickLog, router]
  );

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    if (!q) return allActions;
    return allActions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q)
    );
  }, [allActions, debouncedQuery]);

  useEffect(() => {
    setHighlighted(0);
  }, [debouncedQuery]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const action = filtered[highlighted];
      if (action) {
        onOpenChange(false);
        action.run();
      }
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[90] flex flex-col bg-background/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center gap-2 border-b p-4">
            <Search className="h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Log calories, start a walk, track weight…"
              className="border-none shadow-none focus-visible:ring-0"
            />
            <button onClick={() => onOpenChange(false)} aria-label="Close search">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>

          <motion.div className="flex-1 overflow-y-auto p-2" initial="hidden" animate="visible">
            {filtered.map((action, index) => (
              <motion.button
                key={action.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => {
                  onOpenChange(false);
                  action.run();
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors",
                  index === highlighted ? "bg-accent" : "hover:bg-accent/50"
                )}
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  {action.icon}
                </span>
                <span className="flex flex-col">
                  <span className="font-medium">{action.label}</span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </span>
              </motion.button>
            ))}
            {filtered.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">No matching actions</p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
