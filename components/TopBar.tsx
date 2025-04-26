// components/TopBar.tsx
'use client';

export function TopBar({ title }: { title: string }) {
  return (
    <div className="w-full bg-white shadow p-4 sticky top-0 z-10">
      <h1 className="text-lg font-semibold">{title}</h1>
    </div>
  );
}