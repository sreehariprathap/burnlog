// components/AnnouncementBanners.tsx
'use client';

import useSWR from 'swr';
import { Megaphone } from 'lucide-react';
import {
  Banner,
  BannerIcon,
  BannerTitle,
  BannerAction,
  BannerClose,
} from '@/components/kibo-ui/banner';
import { apiFetch } from '@/lib/apiFetch';

const DISMISSED_KEY = 'announcement-banners-dismissed';

interface AnnouncementBanner {
  id: string;
  message: string;
  url: string | null;
}

async function fetchAnnouncements(): Promise<AnnouncementBanner[]> {
  const res = await apiFetch('/api/announcements');
  if (!res.ok) return [];
  const data = await res.json();
  return data.banners ?? [];
}

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function dismiss(id: string) {
  try {
    const next = getDismissed();
    next.add(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(next)));
  } catch {
    // localStorage unavailable — the banner just reappears next visit, not fatal
  }
}

/** Mounted once in RootLayoutClient — shows every currently-active
 * announcement banner an admin has posted (AdminLog > General > Banners),
 * dismissible per-browser (tracked in localStorage, not per-account). */
export function AnnouncementBanners() {
  const { data: banners = [], mutate } = useSWR('announcements', fetchAnnouncements, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  const dismissed = typeof window !== 'undefined' ? getDismissed() : new Set<string>();
  const visible = banners.filter((b) => !dismissed.has(b.id));

  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col">
      {visible.map((b) => (
        <Banner key={b.id} onClose={() => { dismiss(b.id); mutate(); }}>
          <BannerIcon icon={Megaphone} />
          <BannerTitle>{b.message}</BannerTitle>
          {b.url && (
            <BannerAction asChild>
              <a href={b.url}>Learn more</a>
            </BannerAction>
          )}
          <BannerClose />
        </Banner>
      ))}
    </div>
  );
}
