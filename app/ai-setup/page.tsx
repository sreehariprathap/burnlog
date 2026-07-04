import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import { AiSetupFlow } from './_components/AiSetupFlow';

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
