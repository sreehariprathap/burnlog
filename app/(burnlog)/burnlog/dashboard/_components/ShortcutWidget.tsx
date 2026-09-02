'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon, Dumbbell, LineChart, Heart, CalendarCheck } from 'lucide-react';

type ShortcutOption = {
  label: string;
  href: string;
  icon: LucideIcon;
  color: string;
};

type ShortcutWidgetProps = {
  shortcuts?: ShortcutOption[];
};

export function ShortcutWidget({
  shortcuts = [
    {
      label: 'Start Workout',
      href: '/burnlog/session',
      icon: Dumbbell,
      color: 'bg-chart-1'
    },
    {
      label: 'View Insights',
      href: '/burnlog/insights',
      icon: LineChart,
      color: 'bg-chart-2'
    },
    {
      label: 'Set Goals',
      href: '/burnlog/goals',
      icon: Heart,
      color: 'bg-chart-3'
    },
    {
      label: 'Workout Plan',
      href: '/burnlog/session',
      icon: CalendarCheck,
      color: 'bg-chart-4'
    }
  ]
}: ShortcutWidgetProps) {
  return (
    <Card className="col-span-4">
      <CardContent className="p-3">
        <div className="grid grid-cols-4 gap-2">
          {shortcuts.slice(0, 4).map((shortcut, idx) => {
            const Icon = shortcut.icon;
            
            return (
              <Link 
                key={idx}
                href={shortcut.href}
                className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-warning/20 transition-colors text-center"
              >
                <div className={`${shortcut.color} text-white p-2 rounded-full mb-2`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-xs font-medium">{shortcut.label}</span>
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}