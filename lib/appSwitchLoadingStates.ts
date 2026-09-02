// lib/appSwitchLoadingStates.ts
// Short, funny, domain-flavored steps shown by the multi-step loader while
// switching apps in the hub. Purely cosmetic — no real work happens here.
import type { AppId } from '@/lib/appMode';
import type { LoadingState } from '@/components/ui/multi-step-loader';

// One extra state for the "Switching to <App>…" header line SwitchLoader
// prepends — keep in sync with how many entries each app's list below has.
export const APP_SWITCH_STEP_DURATION_MS = 550;
export const APP_SWITCH_TOTAL_STEPS = 5;

export const APP_SWITCH_LOADING_STATES: Record<AppId, LoadingState[]> = {
  burnlog: [
    { text: 'Counting the calories you swear you burned' },
    { text: 'Convincing your muscles today is leg day' },
    { text: 'Un-crumpling yesterday’s excuses' },
    { text: 'Racking up gains (mostly imaginary)' },
  ],
  logbook: [
    { text: 'Flipping to today’s page' },
    { text: 'Dusting off yesterday’s entries' },
    { text: 'Sharpening the pencil' },
    { text: 'Cross-referencing your chaos' },
  ],
  moneylog: [
    { text: 'Counting coins under the couch cushions' },
    { text: 'Politely ignoring your coffee spending' },
    { text: 'Balancing the books (sort of)' },
    { text: 'Summoning your inner accountant' },
  ],
  tasklog: [
    { text: 'Un-procrastinating your to-do list' },
    { text: 'Sorting urgent from ‘urgent’' },
    { text: 'Bribing your motivation to show up' },
    { text: 'Checking off imaginary boxes for confidence' },
  ],
  homelog: [
    { text: 'Negotiating with the dishes' },
    { text: 'Assigning chores nobody wants' },
    { text: 'Herding household cats (metaphorically)' },
    { text: 'Locating the missing remote' },
  ],
  sociallog: [
    { text: 'Refreshing your social battery' },
    { text: 'Counting the likes that matter' },
    { text: 'Untangling your friend graph' },
    { text: 'Warming up the group chat' },
  ],
  shoppinglog: [
    { text: 'Haggling with imaginary sellers' },
    { text: 'Checking prices twice, buying once' },
    { text: 'Padding the cart responsibly' },
    { text: 'Sniffing out a good deal' },
  ],
  travellog: [
    { text: 'Unfolding the paper map' },
    { text: 'Pretending you know the local language' },
    { text: 'Losing the itinerary, finding an adventure' },
    { text: 'Convincing your passport it’s not expired' },
  ],
  learnlog: [
    { text: 'Dusting off the bookshelf' },
    { text: 'Waking up dormant brain cells' },
    { text: 'Leveling up (theoretically)' },
    { text: 'Reordering your life goals alphabetically' },
  ],
  adminlog: [
    { text: 'Checking your badge at the door' },
    { text: 'Dusting off the big red buttons' },
    { text: 'Loading everyone else’s business' },
    { text: 'Putting on the admin hat' },
  ],
};
