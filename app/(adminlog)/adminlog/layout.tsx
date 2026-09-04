'use client';

import { AdminLogHeader } from '@/components/adminlog/AdminLogHeader';

export default function AdminLogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminLogHeader />
      {children}
    </>
  );
}
