// lib/myday/types.ts
export type MyDaySource = 'manual' | 'burnlog' | 'tasklog' | 'moneylog';

export interface MyDayBlock {
  id: string;
  title: string;
  notes: string | null;
  startTime: string; // 'HH:mm'
  endTime: string; // 'HH:mm'
  source: MyDaySource;
  sourceId: string | null;
  completed: boolean;
  actual: boolean | null; // null = no actual-status signal for this source
}

export interface MyDayUnscheduledItem {
  key: string; // stable React key, e.g. `tasklog:${id}`
  title: string;
  source: Exclude<MyDaySource, 'manual'>;
  sourceId: string;
  label: string; // e.g. 'Planned workout', 'Task due today', 'Bill due'
}

export interface MyDayData {
  date: string; // 'yyyy-MM-dd'
  blocks: MyDayBlock[];
  unscheduled: MyDayUnscheduledItem[];
}

export interface MyDayCalendarMonth {
  month: string; // 'yyyy-MM'
  daysWithBlocks: string[]; // 'yyyy-MM-dd'
}
