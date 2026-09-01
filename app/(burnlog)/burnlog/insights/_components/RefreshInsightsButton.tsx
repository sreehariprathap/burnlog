'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function RefreshInsightsButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    router.refresh();
    // router.refresh() doesn't expose a completion callback, so clear the
    // spinner after a short delay rather than leaving it stuck indefinitely.
    setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <button
      onClick={handleRefresh}
      aria-label="Refresh insights"
      disabled={refreshing}
      className="disabled:opacity-50"
    >
      <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
    </button>
  );
}
