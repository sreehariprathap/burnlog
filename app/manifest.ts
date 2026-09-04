// app/manifest.ts
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LogBook',
    short_name: 'LogBook',
    description: 'Your daily digest across every app you track life with — fitness, money, tasks, home, social, shopping, and travel, all in one place.',
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
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icons/icon-144.png',
        sizes: '144x144',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-96.png',
        sizes: '96x96',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-72.png',
        sizes: '72x72',
        type: 'image/png',
        purpose: 'any'
      },
      {
        src: '/icons/icon-48.png',
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
        label: 'LogBook Dashboard'
      }
    ],
    categories: ['productivity', 'lifestyle', 'utilities'],
    shortcuts: [
      {
        name: "Today's Digest",
        short_name: 'Today',
        description: "View today's cross-app digest",
        url: '/logbook',
        icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }]
      },
      {
        name: 'Morning Brief',
        short_name: 'Morning',
        description: "Start your day's morning brief",
        url: '/logbook/morning',
        icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }]
      },
      {
        name: 'My Day',
        short_name: 'My Day',
        description: 'Plan your day across every app',
        url: '/logbook?tab=myday',
        icons: [{ src: '/icons/icon-96.png', sizes: '96x96' }]
      }
    ]
  }
}
