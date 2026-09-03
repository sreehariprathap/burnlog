import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AiModelTestClient } from './_components/AiModelTestClient';

export default function AiModelTestPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      }
    >
      <AiModelTestClient />
    </Suspense>
  );
}
