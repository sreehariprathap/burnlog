"use client";

import { Wifi } from "lucide-react";
import { useOnlineStatus } from "@/lib/useOnlineStatus";

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm font-medium text-warning-foreground"
      style={{ paddingTop: "env(safe-area-inset-top, 0.5rem)" }}
    >
      <Wifi className="w-4 h-4" aria-hidden="true" />
      You&apos;re offline — changes will sync when you reconnect.
    </div>
  );
}

export default OfflineBanner;
