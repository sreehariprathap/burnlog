"use client";

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const SESSION_STORAGE_KEY = 'burnlog-install-prompt-shown';

export default function PWAInstall() {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
    // Only ever show on the login page
    if (!isLoginPage) return;
    // Already shown once this session, or app is already installed - never show again
    if (sessionStorage.getItem(SESSION_STORAGE_KEY)) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Save the event so it can be triggered later
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowInstallPrompt(true);
      sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isLoginPage]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }

    // Clear the saved prompt since it can't be used again
    setDeferredPrompt(null);
    setShowInstallPrompt(false);
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
  };

  if (!showInstallPrompt || !isLoginPage) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
          <Download className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-medium text-sm">Install burnlog</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Add to home screen for quick access
          </p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <Button
          onClick={handleInstallClick}
          size="sm"
          className="text-xs"
        >
          Install
        </Button>
        <Button
          onClick={handleDismiss}
          variant="ghost"
          size="sm"
          className="p-1"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
