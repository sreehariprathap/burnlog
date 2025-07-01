"use client";

import { useState, useEffect } from 'react';
import { Wifi, WifiOff } from 'lucide-react';

export default function PWAStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      setShowStatus(true);
      
      // Hide status after 3 seconds
      setTimeout(() => setShowStatus(false), 3000);
    };

    // Check initial status
    setIsOnline(navigator.onLine);

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  if (!showStatus) return null;

  return (
    <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-full text-white text-sm font-medium flex items-center space-x-2 transition-all duration-300 ${
      isOnline 
        ? 'bg-green-500' 
        : 'bg-red-500'
    }`}>
      {isOnline ? (
        <>
          <Wifi className="w-4 h-4" />
          <span>Back online</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          <span>You&apos;re offline</span>
        </>
      )}
    </div>
  );
}
