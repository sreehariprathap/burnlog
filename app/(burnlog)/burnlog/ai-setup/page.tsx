import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { AiSetupFlow } from './_components/AiSetupFlow';

export const metadata: Metadata = { title: 'AI Setup - burnlog' };

export default function AiSetupPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="animate-spin h-8 w-8" />
        </div>
      }
    >
      <AiSetupFlow />
    </Suspense>
  );
}
