// lib/search/registry.ts
import type { LucideIcon } from 'lucide-react';
import {
  Sunrise,
  CalendarClock,
  ListTodo,
  Flame,
  Dumbbell,
  Target,
  LineChart,
  UtensilsCrossed,
  Wallet,
  ClipboardList,
  TrendingUp,
  Landmark,
  KanbanSquare,
  Lightbulb,
  ListChecks,
  House,
  Receipt,
  Package,
  Rss,
  MessageCircle,
  Search,
  ShoppingBag,
  ShoppingCart,
  PackageCheck,
  Heart,
  Store,
  Map,
  CalendarRange,
  Sparkles,
} from 'lucide-react';
import type { AppId } from '@/lib/appMode';

export interface SearchItem {
  app: AppId;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
}

// Fixed per-app colors, independent of the ambient .app-* theme class — a
// search result can render before that app's theme is active (same reason
// the *Mark components hardcode their own color; see HomeLogMark).
const APP_COLOR: Record<AppId, string> = {
  logbook: '#4F46E5',
  burnlog: '#F97316',
  moneylog: '#22C55E',
  tasklog: '#3B82F6',
  homelog: '#9253DA',
  sociallog: '#A10059',
  shoppinglog: '#D46000',
  travellog: '#C2703A',
};

export function appSearchColor(app: AppId): string {
  return APP_COLOR[app];
}

/** Major pages/features across every sub-app, for the cross-app search. */
export const SEARCH_REGISTRY: SearchItem[] = [
  { app: 'logbook', label: "Today's Digest", description: 'Cross-app daily summary', href: '/logbook', icon: Sunrise },
  { app: 'logbook', label: 'Morning Brief', description: "Start your day's morning brief", href: '/logbook/morning', icon: CalendarClock },
  { app: 'logbook', label: 'My Day', description: 'Plan your day across every app', href: '/logbook/myday', icon: ListTodo },

  { app: 'burnlog', label: 'Dashboard', description: "Today's activity ring, stats, quick links", href: '/burnlog/dashboard', icon: Flame },
  { app: 'burnlog', label: 'Sessions', description: 'Log workouts, track sets/reps/weight', href: '/burnlog/session', icon: Dumbbell },
  { app: 'burnlog', label: 'Goals', description: 'Create and monitor fitness goals', href: '/burnlog/goals', icon: Target },
  { app: 'burnlog', label: 'Insights', description: 'Charts and trends over weight, workouts, calories', href: '/burnlog/insights', icon: LineChart },
  { app: 'burnlog', label: 'Meal Planner', description: 'AI-assisted meal planning and grocery lists', href: '/burnlog/meal-planner', icon: UtensilsCrossed },

  { app: 'moneylog', label: 'Home', description: 'Transactions and account overview', href: '/moneylog', icon: Wallet },
  { app: 'moneylog', label: 'Plan', description: 'Budgets and recurring items', href: '/moneylog/plan', icon: ClipboardList },
  { app: 'moneylog', label: 'Goals', description: 'Financial goals', href: '/moneylog/goals', icon: Target },
  { app: 'moneylog', label: 'Insights', description: 'Spending trends and recurring items', href: '/moneylog/insights', icon: TrendingUp },
  { app: 'moneylog', label: 'Assets', description: 'Net worth and asset tracking', href: '/moneylog/assets', icon: Landmark },

  { app: 'tasklog', label: 'Board', description: 'Kanban board for tasks', href: '/tasklog/board', icon: KanbanSquare },
  { app: 'tasklog', label: 'Plan', description: 'Plan and break down ideas', href: '/tasklog/plan', icon: Lightbulb },
  { app: 'tasklog', label: 'Goals', description: 'Track your goals', href: '/tasklog/goals', icon: ListChecks },

  { app: 'homelog', label: 'Chores', description: 'Household chores and rotations', href: '/homelog/chores', icon: House },
  { app: 'homelog', label: 'Bills', description: 'Shared expenses and settlements', href: '/homelog/bills', icon: Receipt },
  { app: 'homelog', label: 'Inventory', description: 'Shared household inventory', href: '/homelog/inventory', icon: Package },

  { app: 'sociallog', label: 'Feed', description: 'Posts, follows, and leaderboards', href: '/sociallog', icon: Rss },
  { app: 'sociallog', label: 'Messages', description: 'Direct messages', href: '/sociallog/messages', icon: MessageCircle },
  { app: 'sociallog', label: 'Search', description: 'Search posts, users, and topics', href: '/sociallog/search', icon: Search },

  { app: 'shoppinglog', label: 'Listings', description: 'Browse marketplace listings', href: '/shoppinglog', icon: ShoppingBag },
  { app: 'shoppinglog', label: 'Cart', description: 'Your shopping cart', href: '/shoppinglog/cart', icon: ShoppingCart },
  { app: 'shoppinglog', label: 'Orders', description: 'Order history', href: '/shoppinglog/orders', icon: PackageCheck },
  { app: 'shoppinglog', label: 'Favorites', description: 'Saved listings', href: '/shoppinglog/favorites', icon: Heart },
  { app: 'shoppinglog', label: 'Sell', description: 'Create a new listing', href: '/shoppinglog/sell', icon: Store },

  { app: 'travellog', label: 'Map', description: 'Your world map of visited places', href: '/travellog/map', icon: Map },
  { app: 'travellog', label: 'Plan', description: 'Plan upcoming trips', href: '/travellog/plan', icon: CalendarRange },
  { app: 'travellog', label: 'Suggestions', description: 'AI-assisted trip suggestions', href: '/travellog/suggestions', icon: Sparkles },
];
