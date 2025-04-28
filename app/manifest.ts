// app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'burnlog - Fitness Tracker',
    short_name: 'burnlog',
    description: 'Track your workouts, set fitness goals, and monitor your progress',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#3b82f6',
    orientation: 'portrait',
    scope: '/',
    prefer_related_applications: false,
    icons: [
      { src: '/B.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/B.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/B.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
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
    categories: ['fitness', 'health', 'lifestyle']
  }
}
