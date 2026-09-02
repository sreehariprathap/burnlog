"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';

export default function PWAUpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(newWorker);
                setShowUpdate(true);
              }
            });
          }
        });
      });

      // Listen for controlling service worker change
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    }
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowUpdate(false);
    }
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-50 bg-info/10 border border-info/30 rounded-lg shadow-lg p-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-info rounded-lg flex items-center justify-center">
          <RefreshCw className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-medium text-sm text-info">
            App Update Available
          </p>
          <p className="text-xs text-info">
            A new version is ready to install
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Button
          onClick={handleUpdate}
          size="sm"
          className="text-xs bg-info hover:bg-info/90"
        >
          Update
        </Button>
        <Button
          onClick={handleDismiss}
          variant="ghost"
          size="sm"
          className="p-1 text-info hover:text-info/80"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
