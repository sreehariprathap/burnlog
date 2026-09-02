// lib/notificationTemplates.ts
// Catalog of realistic push-notification templates across every app, used by
// the admin "Test Push Notifications" tool to preview and send a specific
// notification shape instead of one hardcoded generic push.
import { APPS, type AppId } from '@/lib/appMode';

export interface NotificationTemplate {
  id: string;
  app: AppId;
  label: string;
  title: string;
  message: string;
  url: string;
}

export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  // LogBook
  { id: 'logbook-morning-brief', app: 'logbook', label: 'Morning brief ready', title: 'Your morning brief is ready', message: "Here's what's on deck across every app today.", url: '/logbook/morning' },
  { id: 'logbook-streak-reminder', app: 'logbook', label: 'Day streak reminder', title: "Don't lose your streak!", message: 'You have a 12-day streak — log something today to keep it going.', url: '/logbook' },

  // BurnLog
  { id: 'burnlog-workout-reminder', app: 'burnlog', label: 'Workout reminder', title: "Time for today's workout", message: "Push day is on the schedule — let's get it done.", url: '/burnlog/session' },
  { id: 'burnlog-meal-prep', app: 'burnlog', label: 'Meal-prep day', title: 'Meal-prep day is here', message: 'Review this week\'s meal plan and generate your grocery list.', url: '/burnlog/meal-planner' },
  { id: 'burnlog-streak-milestone', app: 'burnlog', label: 'Streak milestone', title: 'Level up! 🔥', message: "You've hit a 7-day streak and reached Level 4.", url: '/burnlog/dashboard' },

  // MoneyLog
  { id: 'moneylog-bill-due', app: 'moneylog', label: 'Bill due soon', title: 'Bill due in 2 days', message: 'Rent ($1,200) is due on the 3rd.', url: '/moneylog/plan' },
  { id: 'moneylog-budget-exceeded', app: 'moneylog', label: 'Budget threshold exceeded', title: 'Over budget: Shopping', message: "You've spent 110% of your Shopping budget this month.", url: '/moneylog/insights' },

  // TaskLog
  { id: 'tasklog-due-today', app: 'tasklog', label: 'Task due today', title: 'Task due today', message: '"Finish Q3 report" is due today.', url: '/tasklog/board' },
  { id: 'tasklog-overdue', app: 'tasklog', label: 'Task overdue', title: 'Task overdue', message: '"Renew car insurance" was due 2 days ago.', url: '/tasklog/board' },

  // HomeLog
  { id: 'homelog-invite-received', app: 'homelog', label: 'Household invite received', title: 'New household invite', message: 'Sam invited you to join The Smiths.', url: '/homelog' },
  { id: 'homelog-invite-accepted', app: 'homelog', label: 'Household invite accepted', title: 'Invite accepted', message: 'Jordan joined your household.', url: '/homelog' },
  { id: 'homelog-chore-assigned', app: 'homelog', label: 'Chore assigned', title: 'New chore assigned to you', message: 'Sam assigned you "Take out recycling."', url: '/homelog/chores' },
  { id: 'homelog-chore-overdue', app: 'homelog', label: 'Chore overdue', title: 'Chore overdue', message: '"Clean kitchen" was due yesterday.', url: '/homelog/chores' },
  { id: 'homelog-settlement-requested', app: 'homelog', label: 'Settlement requested', title: 'Settlement requested', message: 'Jordan requested $42.50 for shared groceries.', url: '/homelog/bills' },

  // SocialLog
  { id: 'sociallog-new-follower', app: 'sociallog', label: 'New follower', title: 'New follower', message: '@maya_runs started following you.', url: '/sociallog' },
  { id: 'sociallog-follow-request', app: 'sociallog', label: 'New follow request', title: 'New follow request', message: '@devon_builds wants to follow you.', url: '/sociallog' },
  { id: 'sociallog-follow-accepted', app: 'sociallog', label: 'Follow request accepted', title: 'Follow request accepted', message: '@bindya_w accepted your follow request.', url: '/sociallog' },
  { id: 'sociallog-new-message', app: 'sociallog', label: 'New direct message', title: 'New message', message: 'devon_builds: "Hey, are you free this weekend?"', url: '/sociallog/messages' },
  { id: 'sociallog-new-comment', app: 'sociallog', label: 'Comment on your post', title: 'New comment', message: 'bindya_w commented on your post: "This is awesome!"', url: '/sociallog' },

  // ShoppingLog
  { id: 'shoppinglog-order-shipped', app: 'shoppinglog', label: 'Order shipped', title: 'Your order has shipped', message: '"Vintage desk lamp" is on its way.', url: '/shoppinglog/orders' },
  { id: 'shoppinglog-new-message', app: 'shoppinglog', label: 'New message from buyer', title: 'New message from a buyer', message: 'Someone asked a question about your listing "Road bike, size M."', url: '/shoppinglog/orders' },

  // TravelLog
  { id: 'travellog-trip-reminder', app: 'travellog', label: 'Upcoming trip reminder', title: 'Trip coming up', message: 'Your trip to Kyoto starts in 5 days.', url: '/travellog' },
  { id: 'travellog-suggestions-ready', app: 'travellog', label: 'New AI trip suggestions ready', title: 'New trip ideas ready', message: "We found 3 affordable trips that fit your free time this month.", url: '/travellog/suggestions' },
  { id: 'travellog-trip-invite', app: 'travellog', label: 'New trip invite', title: 'New trip invite', message: 'Sam invited you to join the trip to Kyoto.', url: '/travellog/plan' },
  { id: 'travellog-trip-invite-accepted', app: 'travellog', label: 'Trip invite accepted', title: 'Trip invite accepted', message: 'Jordan joined your trip.', url: '/travellog/trips' },
  { id: 'travellog-trip-invite-declined', app: 'travellog', label: 'Trip invite declined', title: 'Trip invite declined', message: 'Jordan declined your trip invite.', url: '/travellog/trips' },

  // LearnLog
  { id: 'learnlog-practice-reminder', app: 'learnlog', label: 'Practice reminder (streak)', title: "Keep your streak alive", message: 'Log a Skiing session today to keep your 5-day streak.', url: '/learnlog/skills' },
  { id: 'learnlog-classes-ready', app: 'learnlog', label: 'Nearby classes ready', title: 'Nearby classes found', message: 'We found 4 skiing class ideas near Vancouver.', url: '/learnlog/skills' },
  { id: 'learnlog-cert-expiring', app: 'learnlog', label: 'Certification expiring', title: 'Certification expiring soon', message: 'Your "First Aid & CPR" certification expires in 30 days.', url: '/learnlog/career' },
];

export function templatesByApp(): { app: AppId; label: string; templates: NotificationTemplate[] }[] {
  const groups = new Map<AppId, NotificationTemplate[]>();
  for (const t of NOTIFICATION_TEMPLATES) {
    const list = groups.get(t.app) ?? [];
    list.push(t);
    groups.set(t.app, list);
  }
  return Array.from(groups.entries()).map(([app, templates]) => ({
    app,
    label: APPS[app].name,
    templates,
  }));
}
