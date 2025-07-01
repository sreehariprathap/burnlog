// app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'burnlog - Fitness Tracker',
    short_name: 'burnlog',
    description: 'Track your workouts, set fitness goals, and monitor your progress with our comprehensive fitness tracking app',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b82f6',
    orientation: 'portrait',
    scope: '/',
    prefer_related_applications: false,
    lang: 'en',
    icons: [
      { 
        src: '/B.png', 
        sizes: '192x192', 
        type: 'image/png', 
        purpose: 'any' 
      },
      { 
        src: '/B.png', 
        sizes: '512x512', 
        type: 'image/png', 
        purpose: 'any' 
      },
      { 
        src: '/B.png', 
        sizes: '512x512', 
        type: 'image/png', 
        purpose: 'maskable' 
      },
      { 
        src: '/B.png', 
        sizes: '144x144', 
        type: 'image/png', 
        purpose: 'any' 
      },
      { 
        src: '/B.png', 
        sizes: '96x96', 
        type: 'image/png', 
        purpose: 'any' 
      },
      { 
        src: '/B.png', 
        sizes: '72x72', 
        type: 'image/png', 
        purpose: 'any' 
      },
      { 
        src: '/B.png', 
        sizes: '48x48', 
        type: 'image/png', 
        purpose: 'any' 
      }
    ],
    screenshots: [
      {
        src: '/burnlog-icon-splash.png',
        sizes: '1080x1920',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'burnlog Dashboard'
      }
    ],
    categories: ['fitness', 'health', 'lifestyle', 'productivity'],
    shortcuts: [
      {
        name: 'Start Workout',
        short_name: 'Workout',
        description: 'Start a new workout session',
        url: '/session',
        icons: [{ src: '/B.png', sizes: '96x96' }]
      },
      {
        name: 'View Dashboard',
        short_name: 'Dashboard',
        description: 'View your fitness dashboard',
        url: '/dashboard',
        icons: [{ src: '/B.png', sizes: '96x96' }]
      },
      {
        name: 'Check Goals',
        short_name: 'Goals',
        description: 'Check your fitness goals',
        url: '/goals',
        icons: [{ src: '/B.png', sizes: '96x96' }]
      }
    ]
  }
}
