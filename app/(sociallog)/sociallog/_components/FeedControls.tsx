// app/(sociallog)/sociallog/_components/FeedControls.tsx
'use client';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = 'foryou' | 'following';
type Sort = 'hot' | 'new' | 'top';

export function FeedControls({
  tab,
  sort,
  onTabChange,
  onSortChange,
}: {
  tab: Tab;
  sort: Sort;
  onTabChange: (tab: Tab) => void;
  onSortChange: (sort: Sort) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <Tabs value={tab} onValueChange={(v) => onTabChange(v as Tab)}>
        <TabsList>
          <TabsTrigger value="foryou">For You</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>
      </Tabs>
      <Tabs value={sort} onValueChange={(v) => onSortChange(v as Sort)}>
        <TabsList>
          <TabsTrigger value="hot">Hot</TabsTrigger>
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="top">Top</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}
