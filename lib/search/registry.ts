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
  Settings,
  LayoutDashboard,
  UserCircle,
  Bot,
  GraduationCap,
  Library,
  Briefcase,
  NotebookPen,
  Clapperboard,
  ListVideo,
  Compass,
  BarChart3,
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
  learnlog: '#FF3366',
  adminlog: '#475569',
  intellog: '#8B5CF6',
  watchlog: '#DC2626',
};

export function appSearchColor(app: AppId): string {
  return APP_COLOR[app];
}

/** Major pages/features across every sub-app, for the cross-app search. */
export const SEARCH_REGISTRY: SearchItem[] = [
  { app: 'logbook', label: "Today's Digest", description: 'Cross-app daily summary', href: '/logbook', icon: Sunrise },
  { app: 'logbook', label: 'Morning Brief', description: "Start your day's morning brief", href: '/logbook/morning', icon: CalendarClock },
  { app: 'logbook', label: 'My Day', description: 'Plan your day across every app', href: '/logbook?tab=myday', icon: ListTodo },
  { app: 'logbook', label: 'Profile', description: 'Shared identity: avatar, name, username, default app', href: '/profile', icon: UserCircle },

  { app: 'burnlog', label: 'Dashboard', description: "Today's activity ring, stats, quick links (BurnLog home)", href: '/burnlog/dashboard', icon: Flame },
  { app: 'burnlog', label: 'Sessions', description: 'Log workouts, track sets/reps/weight', href: '/burnlog/session', icon: Dumbbell },
  { app: 'burnlog', label: 'Goals', description: 'Create and monitor fitness goals (BurnLog)', href: '/burnlog/goals', icon: Target },
  { app: 'burnlog', label: 'Insights', description: 'Charts and trends over weight, workouts, calories (BurnLog)', href: '/burnlog/insights', icon: LineChart },
  { app: 'burnlog', label: 'Meal Planner', description: 'AI-assisted meal planning and grocery lists', href: '/burnlog/meal-planner', icon: UtensilsCrossed },
  { app: 'burnlog', label: 'Favorite Meals', description: 'Set dishes you always want worked into your meal plan', href: '/burnlog/meal-planner?step=preferences', icon: Heart },
  { app: 'burnlog', label: 'Grocery List', description: 'Generated grocery list from your meal plan', href: '/burnlog/meal-planner/grocery-list', icon: ShoppingCart },
  { app: 'burnlog', label: 'AI Onboarding', description: 'Conversational setup that builds your first workout plan', href: '/burnlog/ai-setup', icon: Bot },
  { app: 'burnlog', label: 'Config', description: 'Health metrics, streak card, AI insights, water tracking (BurnLog)', href: '/burnlog/dashboard/config', icon: Settings },

  { app: 'moneylog', label: 'Home', description: 'Transactions and account overview (MoneyLog)', href: '/moneylog', icon: Wallet },
  { app: 'moneylog', label: 'Plan', description: 'Budget planning (MoneyLog)', href: '/moneylog?tab=plan', icon: ClipboardList },
  { app: 'moneylog', label: 'Goals', description: 'Financial goals — savings, debt payoff (MoneyLog)', href: '/moneylog?tab=goals', icon: Target },
  { app: 'moneylog', label: 'Insights', description: 'Spending trends and recurring items (MoneyLog)', href: '/moneylog?tab=insights', icon: TrendingUp },
  { app: 'moneylog', label: 'Assets', description: 'Net worth and asset tracking', href: '/moneylog/assets', icon: Landmark },
  { app: 'moneylog', label: 'Onboarding', description: 'Budget-setup wizard for new MoneyLog users', href: '/moneylog/onboarding', icon: Sparkles },
  { app: 'moneylog', label: 'Config', description: 'MoneyLog settings and export (MoneyLog)', href: '/moneylog/config', icon: Settings },

  { app: 'tasklog', label: 'Home', description: 'Task overview (TaskLog)', href: '/tasklog', icon: LayoutDashboard },
  { app: 'tasklog', label: 'Board', description: 'Kanban board for tasks', href: '/tasklog?tab=board', icon: KanbanSquare },
  { app: 'tasklog', label: 'Plan', description: 'Plan and break down ideas (TaskLog)', href: '/tasklog?tab=plan', icon: Lightbulb },
  { app: 'tasklog', label: 'Goals', description: 'Track your goals, separate from tasks (TaskLog)', href: '/tasklog?tab=goals', icon: ListChecks },
  { app: 'tasklog', label: 'Config', description: 'TaskLog settings and export (TaskLog)', href: '/tasklog/config', icon: Settings },

  { app: 'homelog', label: 'Home', description: 'Household overview (HomeLog)', href: '/homelog', icon: LayoutDashboard },
  { app: 'homelog', label: 'Chores', description: 'Household chores and rotations', href: '/homelog/chores', icon: House },
  { app: 'homelog', label: 'Bills', description: 'Shared expenses and settlements', href: '/homelog/bills', icon: Receipt },
  { app: 'homelog', label: 'Inventory', description: 'Shared household inventory', href: '/homelog/inventory', icon: Package },
  { app: 'homelog', label: 'Config', description: 'HomeLog settings and export (HomeLog)', href: '/homelog/config', icon: Settings },

  { app: 'sociallog', label: 'Feed', description: 'Posts, follows, and leaderboards', href: '/sociallog', icon: Rss },
  { app: 'sociallog', label: 'Messages', description: 'Direct messages', href: '/sociallog?tab=messages', icon: MessageCircle },
  { app: 'sociallog', label: 'Search', description: 'Search posts, users, and topics (SocialLog)', href: '/sociallog?tab=search', icon: Search },
  { app: 'sociallog', label: 'Config', description: 'SocialLog settings and export (SocialLog)', href: '/sociallog/config', icon: Settings },

  { app: 'shoppinglog', label: 'Listings', description: 'Browse marketplace listings (ShoppingLog home)', href: '/shoppinglog', icon: ShoppingBag },
  { app: 'shoppinglog', label: 'Cart', description: 'Your shopping cart', href: '/shoppinglog?tab=cart', icon: ShoppingCart },
  { app: 'shoppinglog', label: 'Orders', description: 'Order history as buyer or seller', href: '/shoppinglog/orders', icon: PackageCheck },
  { app: 'shoppinglog', label: 'Favorites', description: 'Saved listings', href: '/shoppinglog/favorites', icon: Heart },
  { app: 'shoppinglog', label: 'Sell', description: 'Create and manage your own listings', href: '/shoppinglog?tab=sell', icon: Store },
  { app: 'shoppinglog', label: 'Config', description: 'ShoppingLog settings and export (ShoppingLog)', href: '/shoppinglog/config', icon: Settings },

  { app: 'travellog', label: 'Home', description: 'Visit stats: total visits, countries, explored stops (TravelLog)', href: '/travellog', icon: LayoutDashboard },
  { app: 'travellog', label: 'Map', description: 'Your world map of visited places', href: '/travellog?tab=map', icon: Map },
  { app: 'travellog', label: 'Plan', description: 'AI-assisted trip planner (TravelLog)', href: '/travellog?tab=plan', icon: CalendarRange },
  { app: 'travellog', label: 'Suggestions', description: 'AI-assisted, affordable trip suggestions', href: '/travellog?tab=suggestions', icon: Sparkles },
  { app: 'travellog', label: 'Config', description: 'Country setting for holiday lookup, and more (TravelLog)', href: '/travellog/config', icon: Settings },

  { app: 'learnlog', label: 'Home', description: 'Skills, reading, and career overview (LearnLog)', href: '/learnlog', icon: GraduationCap },
  { app: 'learnlog', label: 'Library', description: 'Books and courses — want to read, in progress, completed', href: '/learnlog?tab=library', icon: Library },
  { app: 'learnlog', label: 'Skills', description: 'Practical skills with level/XP/streak tracking (LearnLog)', href: '/learnlog?tab=skills', icon: Dumbbell },
  { app: 'learnlog', label: 'Career', description: 'Role timeline, certifications, career goals', href: '/learnlog?tab=career', icon: Briefcase },
  { app: 'learnlog', label: 'Reflections', description: 'Freeform journal for personal growth', href: '/learnlog?tab=reflections', icon: NotebookPen },
  { app: 'learnlog', label: 'Config', description: 'City setting, AI suggestions toggle, and more (LearnLog)', href: '/learnlog/config', icon: Settings },
  { app: 'watchlog', label: 'Home', description: 'Continue watching and AI mood-based suggestions (WatchLog)', href: '/watchlog', icon: Clapperboard },
  { app: 'watchlog', label: 'Watchlist', description: 'Want to Watch, Watching, and Completed (WatchLog)', href: '/watchlog?tab=watchlist', icon: ListVideo },
  { app: 'watchlog', label: 'Discover', description: 'Search and browse trending movies and TV (WatchLog)', href: '/watchlog?tab=discover', icon: Compass },
  { app: 'watchlog', label: 'Stats', description: 'Genres watched, hours watched, ratings given (WatchLog)', href: '/watchlog?tab=stats', icon: BarChart3 },
];
