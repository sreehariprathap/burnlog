// components/BottomNav.tsx
'use client';
import Link from 'next/link';
import { HomeIcon, DumbbellIcon, TargetIcon, UserIcon, ChartLine } from 'lucide-react';

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 w-full bg-white shadow py-2 flex justify-around">
      <Link href="/dashboard" className="flex flex-col items-center text-sm">
        <HomeIcon className="w-6 h-6" />
        <span>Home</span>
      </Link>
      <Link href="/session" className="flex flex-col items-center text-sm">
        <DumbbellIcon className="w-6 h-6" />
        <span>Workout</span>
      </Link>
      <Link href="/goals" className="flex flex-col items-center text-sm">
        <TargetIcon className="w-6 h-6" />
        <span>Goals</span>
      </Link>
      <Link href="/insights" className="flex flex-col items-center text-sm">
        <ChartLine className="w-6 h-6" />
        <span>Insights</span>
      </Link>
      <Link href="/profile" className="flex flex-col items-center text-sm">
        <UserIcon className="w-6 h-6" />
        <span>Profile</span>
      </Link>
    </nav>
  );
}
