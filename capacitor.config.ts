import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.logbook.app',
  appName: 'LogBook',
  webDir: 'mobile/www',
  server: {
    url: 'https://burnlog-green.vercel.app',
    cleartext: false,
    androidScheme: 'https',
    errorPath: 'offline.html'
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#3b82f6',
      androidSplashResourceName: 'splash',
      splashFullScreen: true,
      splashImmersive: true,
      showSpinner: false
    }
  }
};

export default config;
