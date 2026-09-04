// lib/adminlog/nav.ts
//
// Single source of truth for AdminLog's navigation: which pages exist,
// which category each belongs to, and what icon represents it. Both the
// dashboard (grouped sections) and the header (back-button label lookup)
// read from this.
import type { LucideIcon } from 'lucide-react';
import {
  Settings,
  Bug,
  UserPlus,
  Wrench,
  Rocket,
  Brain,
  Database,
  FlaskConical,
  Palette,
  ToggleLeft,
} from 'lucide-react';

export type AdminNavCategoryKey = 'general' | 'ai' | 'error' | 'ui-themes' | 'user';

export const DEFAULT_ADMIN_CATEGORY: AdminNavCategoryKey = 'general';

export interface AdminNavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export interface AdminNavCategory {
  key: AdminNavCategoryKey;
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavCategory[] = [
  {
    key: 'general',
    label: 'General',
    icon: Settings,
    items: [
      { href: '/adminlog/toggles', label: 'App & Feature Toggles', description: 'Turn apps and beta features on/off globally or per-user.', icon: ToggleLeft },
      { href: '/adminlog/tools', label: 'Admin Tools', description: 'Test push notifications, onboarding pages.', icon: Wrench },
      { href: '/adminlog/test-onboarding', label: 'Test Onboarding', description: 'Run the real onboarding flow as a disposable test account.', icon: Rocket },
    ],
  },
  {
    key: 'ai',
    label: 'AI',
    icon: Brain,
    items: [
      { href: '/adminlog/ai-models', label: 'AI Model Mapping', description: 'Choose which OpenRouter model powers each AI feature across the app.', icon: Brain },
      { href: '/adminlog/model-gather', label: 'Model Gather', description: 'Browse OpenRouter\'s full catalog and curate which models are available across the app.', icon: Database },
      { href: '/adminlog/ai-model-test', label: 'AI Model Test', description: 'Ask a fixed test question to any free model and compare latency, throughput, and response quality.', icon: FlaskConical },
    ],
  },
  {
    key: 'error',
    label: 'Errors',
    icon: Bug,
    items: [
      { href: '/adminlog/errors', label: 'Error Log', description: 'Browse persisted client, server, and background job errors.', icon: Bug },
    ],
  },
  {
    key: 'ui-themes',
    label: 'UI & Themes',
    icon: Palette,
    items: [
      { href: '/adminlog/button-theme', label: 'Button Theme', description: 'Pick which visual style each themeable button element uses across the app.', icon: Palette },
    ],
  },
  {
    key: 'user',
    label: 'Users',
    icon: UserPlus,
    items: [
      { href: '/adminlog/invites', label: 'Invites', description: 'Send and track invites to new users.', icon: UserPlus },
    ],
  },
];

export function findAdminNavItem(pathname: string): { category: AdminNavCategory; item: AdminNavItem } | null {
  for (const category of ADMIN_NAV) {
    const item = category.items.find((i) => pathname === i.href || pathname.startsWith(i.href + '/'));
    if (item) return { category, item };
  }
  return null;
}
