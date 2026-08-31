import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { MyDayClient } from './_components/MyDayClient';

export const metadata: Metadata = { title: 'MyDay - burnlog' };

export default function MyDayPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <MyDayClient />
    </Suspense>
  );
}
