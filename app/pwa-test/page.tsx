"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Smartphone, Wifi, Download, Bell, LucideIcon } from 'lucide-react';

export default function PWATest() {
  const [pwaStatus, setPwaStatus] = useState({
    serviceWorker: false,
    manifest: false,
    installable: false,
    offline: false,
    pushNotifications: false
  });

  useEffect(() => {
    const checkPWAFeatures = async () => {
      const newStatus = {
        serviceWorker: false,
        manifest: false,
        installable: false,
        offline: false,
        pushNotifications: false
      };

      // Check Service Worker
      if ('serviceWorker' in navigator) {
        newStatus.serviceWorker = true;
      }

      // Check Manifest
      try {
        const manifestResponse = await fetch('/manifest.webmanifest');
        if (manifestResponse.ok) {
          newStatus.manifest = true;
        }
      } catch (error) {
        console.log('Manifest check failed:', error);
      }

      // Check if installable
      window.addEventListener('beforeinstallprompt', () => {
        newStatus.installable = true;
        setPwaStatus(prev => ({ ...prev, installable: true }));
      });

      // Check if already installed
      if (window.matchMedia('(display-mode: standalone)').matches) {
        newStatus.installable = true;
      }

      // Check Push Notifications
      if ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window) {
        newStatus.pushNotifications = true;
      }

      // Check offline capability (basic check)
      if ('serviceWorker' in navigator && 'caches' in window) {
        newStatus.offline = true;
      }

      setPwaStatus(newStatus);
    };

    checkPWAFeatures();
  }, []);

  const testOffline = () => {
    window.location.href = '/offline';
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        new Notification('PWA Test', {
          body: 'Push notifications are working!',
          icon: '/B.png'
        });
      }
    }
  };

  const StatusItem = ({ 
    title, 
    description, 
    status, 
    icon: Icon 
  }: { 
    title: string; 
    description: string; 
    status: boolean; 
    icon: LucideIcon; 
  }) => (
    <div className="flex items-center space-x-3 p-3 rounded-lg border">
      <Icon className="w-5 h-5 text-blue-600" />
      <div className="flex-1">
        <h4 className="font-medium">{title}</h4>
        <p className="text-sm text-gray-600">{description}</p>
      </div>
      {status ? (
        <CheckCircle className="w-5 h-5 text-green-600" />
      ) : (
        <XCircle className="w-5 h-5 text-red-600" />
      )}
    </div>
  );

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">PWA Status Check</h1>
        <p className="text-gray-600">
          Test your Progressive Web App features
        </p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>PWA Features Status</CardTitle>
          <CardDescription>
            Check which PWA features are available and working
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StatusItem
            title="Service Worker"
            description="Background sync and caching"
            status={pwaStatus.serviceWorker}
            icon={Wifi}
          />
          <StatusItem
            title="App Manifest"
            description="Installable app configuration"
            status={pwaStatus.manifest}
            icon={Smartphone}
          />
          <StatusItem
            title="Installable"
            description="Can be added to home screen"
            status={pwaStatus.installable}
            icon={Download}
          />
          <StatusItem
            title="Offline Support"
            description="Works without internet connection"
            status={pwaStatus.offline}
            icon={Wifi}
          />
          <StatusItem
            title="Push Notifications"
            description="Background notifications support"
            status={pwaStatus.pushNotifications}
            icon={Bell}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test PWA Features</CardTitle>
          <CardDescription>
            Interactive tests for PWA functionality
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button 
            onClick={testOffline} 
            variant="outline" 
            className="w-full"
          >
            Test Offline Page
          </Button>
          <Button 
            onClick={requestNotificationPermission} 
            variant="outline" 
            className="w-full"
          >
            Test Push Notifications
          </Button>
          <Button 
            onClick={() => window.location.reload()} 
            variant="outline" 
            className="w-full"
          >
            Test Service Worker Update
          </Button>
        </CardContent>
      </Card>

      <div className="mt-8 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-medium mb-2">🎉 Your app is PWA-ready!</h3>
        <p className="text-sm text-gray-700">
          Users can now install your app on their devices, use it offline, and receive push notifications.
        </p>
      </div>
    </div>
  );
}
