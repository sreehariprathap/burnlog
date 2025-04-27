// components/BottomNav.tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeIcon,
  DumbbellIcon,
  TargetIcon,
  UserIcon,
  ChartLine
} from 'lucide-react';

const tabs = [
  { href: '/dashboard', label: 'Home', Icon: HomeIcon },
  { href: '/session',   label: 'Workout', Icon: DumbbellIcon },
  { href: '/goals',     label: 'Goals', Icon: TargetIcon },
  { href: '/insights',  label: 'Insights', Icon: ChartLine },
  { href: '/profile',   label: 'Profile', Icon: UserIcon },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 w-full bg-white shadow py-2 flex justify-around">
      {tabs.map(({ href, label, Icon }) => {
        const isActive =
          pathname === href || pathname.startsWith(href + '/');
        const colorClass = isActive ? 'text-blue-500' : 'text-gray-500';
        return (
          <Link
            key={href}
            href={href}
            className={`flex flex-col items-center text-sm ${colorClass}`}
          >
            <Icon className={`w-6 h-6 mb-0.5 ${colorClass}`} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
