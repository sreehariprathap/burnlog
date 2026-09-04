// components/ai/AskAiInput.tsx
//
// Adapted from smoothui's `morph-surface` (https://smoothui.dev/r/morph-surface.json),
// which ships with no props at all — a fixed "Ask AI" label, a fixed "Ask me
// anything..." placeholder, and a submit handler that never reads the
// textarea value. This version threads those through as props and drives
// the Siri orb's real idle/thinking/done/error states off the actual
// `onSubmit` promise, instead of the vendored version's single static orb.
'use client';

import SmoothButton from '@/components/smoothui/smooth-button';
import SiriOrb from '@/components/smoothui/siri-orb';
import type { AIState } from '@/components/smoothui/ai-core';
import { cx } from 'class-variance-authority';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import React from 'react';
import { useClickOutside } from './useClickOutside';

const SUCCESS_DURATION = 1500;
const ERROR_DURATION = 1500;
const DOCK_HEIGHT = 44;
const PANEL_BORDER_RADIUS = 14;
const DOCK_BORDER_RADIUS = 20;
const SPRING_STIFFNESS = 550;
const SPRING_DAMPING = 45;
const SPRING_MASS = 0.7;
const CLOSE_DELAY = 0.08;
// Fixed pixel width for the expanded panel — but capped to a fraction of the
// viewport (via CSS min()) everywhere it's actually applied below, so the
// panel never forces horizontal overflow on narrow/mobile screens.
const PANEL_WIDTH = 360;
const PANEL_WIDTH_CSS = `min(${PANEL_WIDTH}px, calc(100vw - 2rem))`;
const PANEL_HEIGHT = 200;

type Phase = 'idle' | 'submitting' | 'done' | 'error';

interface AskAiContext {
  open: boolean;
  phase: Phase;
  openPanel: () => void;
  closePanel: () => void;
}

const AskAiContextObj = React.createContext({} as AskAiContext);
const useAskAi = () => React.useContext(AskAiContextObj);

export interface AskAiInputProps {
  /** Button/dock label. */
  label?: string;
  /** Textarea placeholder. */
  placeholder?: string;
  /** Called with the trimmed instruction text on submit. */
  onSubmit: (instructions: string) => Promise<void>;
}

export function AskAiInput({ label = 'Ask AI', placeholder = 'Ask me anything…', onSubmit }: AskAiInputProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [phase, setPhase] = React.useState<Phase>('idle');
  const shouldReduceMotion = useReducedMotion();

  const closePanel = React.useCallback(() => {
    setOpen(false);
    textareaRef.current?.blur();
  }, []);

  const openPanel = React.useCallback(() => {
    setOpen(true);
    setTimeout(() => textareaRef.current?.focus());
  }, []);

  useClickOutside(rootRef, closePanel);

  const handleSubmit = React.useCallback(
    async (instructions: string) => {
      setPhase('submitting');
      try {
        await onSubmit(instructions);
        closePanel();
        setPhase('done');
        setTimeout(() => setPhase('idle'), SUCCESS_DURATION);
      } catch {
        setPhase('error');
        setTimeout(() => setPhase('idle'), ERROR_DURATION);
      }
    },
    [onSubmit, closePanel]
  );

  const context = React.useMemo<AskAiContext>(
    () => ({ closePanel, open, openPanel, phase }),
    [open, phase, openPanel, closePanel]
  );

  return (
    <div
      className="flex max-w-full items-center justify-center"
      style={{ height: open ? PANEL_HEIGHT : DOCK_HEIGHT }}
    >
      <motion.div
        animate={
          shouldReduceMotion
            ? {}
            : {
                borderRadius: open ? PANEL_BORDER_RADIUS : DOCK_BORDER_RADIUS,
                height: open ? PANEL_HEIGHT : DOCK_HEIGHT,
                width: open ? PANEL_WIDTH_CSS : 'auto',
              }
        }
        className={cx('relative flex max-w-[calc(100vw-2rem)] flex-col items-center overflow-hidden border bg-background')}
        initial={false}
        ref={rootRef}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : {
                damping: SPRING_DAMPING,
                delay: open ? 0 : CLOSE_DELAY,
                duration: 0.25,
                mass: SPRING_MASS,
                stiffness: SPRING_STIFFNESS,
                type: 'spring' as const,
              }
        }
      >
        <AskAiContextObj.Provider value={context}>
          <Dock label={label} />
          <Panel placeholder={placeholder} onSubmit={handleSubmit} ref={textareaRef} />
        </AskAiContextObj.Provider>
      </motion.div>
    </div>
  );
}

const PHASE_TO_ORB_STATE: Record<Phase, AIState> = {
  done: 'done',
  error: 'error',
  idle: 'idle',
  submitting: 'thinking',
};

function Dock({ label }: { label: string }) {
  const { open, openPanel, phase } = useAskAi();
  const shouldReduceMotion = useReducedMotion();
  return (
    <footer className="mt-auto flex h-[44px] select-none items-center justify-center whitespace-nowrap">
      <div className="flex items-center justify-center gap-2 px-3">
        <div className="flex w-fit items-center gap-2">
          <AnimatePresence mode="wait">
            {open ? (
              <motion.div
                animate={shouldReduceMotion ? {} : { opacity: 0 }}
                className="h-5 w-5"
                exit={shouldReduceMotion ? {} : { opacity: 0 }}
                initial={shouldReduceMotion ? {} : { opacity: 0 }}
                key="placeholder"
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
              />
            ) : (
              <motion.div
                animate={{ opacity: 1 }}
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-visible"
                exit={shouldReduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
                initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
                key="siri-orb"
                transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
              >
                <SiriOrb state={PHASE_TO_ORB_STATE[phase]} size="24px" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <SmoothButton
          className="flex h-fit flex-1 justify-end rounded-full px-2 py-0.5!"
          onClick={openPanel}
          type="button"
          variant="ghost"
        >
          <span className="truncate">{label}</span>
        </SmoothButton>
      </div>
    </footer>
  );
}

function Panel({
  ref,
  placeholder,
  onSubmit,
}: {
  ref: React.Ref<HTMLTextAreaElement>;
  placeholder: string;
  onSubmit: (instructions: string) => void;
}) {
  const { closePanel, open, phase } = useAskAi();
  const shouldReduceMotion = useReducedMotion();
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get('instructions');
    onSubmit(typeof value === 'string' ? value.trim() : '');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      closePanel();
    }
    if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      submitRef.current?.click();
    }
  }

  return (
    <form
      className="absolute bottom-0"
      onSubmit={handleSubmit}
      ref={formRef}
      style={{ height: PANEL_HEIGHT, pointerEvents: open ? 'all' : 'none', width: PANEL_WIDTH_CSS }}
    >
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="flex h-full flex-col p-1"
            exit={shouldReduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { damping: SPRING_DAMPING, duration: 0.25, mass: SPRING_MASS, stiffness: SPRING_STIFFNESS, type: 'spring' as const }
            }
          >
            <div className="flex justify-between py-1">
              <p className="z-2 ml-[38px] flex select-none items-center gap-[6px] text-foreground text-sm">
                Ask AI
              </p>
              <button
                className="right-4 mt-1 flex -translate-y-[3px] cursor-pointer select-none items-center justify-center gap-1 rounded-[12px] bg-transparent pr-1 text-center text-foreground disabled:opacity-50"
                disabled={phase === 'submitting'}
                ref={submitRef}
                type="submit"
              >
                <Kbd>⌘</Kbd>
                <Kbd className="w-fit">Enter</Kbd>
              </button>
            </div>
            <textarea
              className="h-full w-full resize-none scroll-py-2 rounded-md bg-primary p-4 outline-0"
              disabled={phase === 'submitting'}
              name="instructions"
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              ref={ref}
              required
              spellCheck={false}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <AnimatePresence>
        {open ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute top-4 left-5 flex h-8 w-8 items-center justify-center overflow-visible"
            exit={shouldReduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }}
          >
            <SiriOrb state={PHASE_TO_ORB_STATE[phase]} size="24px" />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </form>
  );
}

function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cx(
        'flex h-6 w-fit items-center justify-center rounded-sm border bg-primary px-[6px] font-sans text-foreground text-xs',
        className
      )}
    >
      {children}
    </kbd>
  );
}
