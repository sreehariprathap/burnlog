'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Trash2, Megaphone } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { apiFetch } from '@/lib/apiFetch';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Banner, BannerIcon, BannerTitle } from '@/components/kibo-ui/banner';

interface AnnouncementBanner {
  id: string;
  message: string;
  url: string | null;
  active: boolean;
  createdAt: string;
}

async function fetchBanners(): Promise<AnnouncementBanner[]> {
  const res = await apiFetch('/api/adminlog/banners');
  if (!res.ok) throw new Error('Failed to load banners');
  const data = await res.json();
  return data.banners ?? [];
}

export default function BannersPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const { data: banners, isLoading, mutate } = useSWR(profile?.isAdmin ? 'adminlog-banners' : null, fetchBanners);
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!message.trim()) return;
    setSaving(true);
    const res = await apiFetch('/api/adminlog/banners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, url: url || undefined }),
    });
    setSaving(false);
    if (res.ok) {
      setMessage('');
      setUrl('');
      mutate();
    }
  }

  async function toggleActive(id: string, active: boolean) {
    await apiFetch(`/api/adminlog/banners/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    });
    mutate();
  }

  async function remove(id: string) {
    await apiFetch(`/api/adminlog/banners/${id}`, { method: 'DELETE' });
    mutate();
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <p className="text-sm text-muted-foreground">
        Active banners show to every signed-in user, site-wide, until they dismiss it (dismissal is
        per-browser, not permanent).
      </p>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="space-y-2">
            <Label htmlFor="banner-message">Message</Label>
            <Input id="banner-message" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Scheduled maintenance tonight at 10pm" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="banner-url">Link (optional)</Label>
            <Input id="banner-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="/adminlog" />
          </div>
          {message.trim() && (
            <Banner className="rounded-lg">
              <BannerIcon icon={Megaphone} />
              <BannerTitle>{message}</BannerTitle>
            </Banner>
          )}
          <Button onClick={handleCreate} disabled={saving || !message.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post banner'}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      ) : (
        <div className="space-y-2">
          {(banners ?? []).map((b) => (
            <Card key={b.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{b.message}</p>
                  {b.url && <p className="truncate text-xs text-muted-foreground">{b.url}</p>}
                </div>
                <Switch checked={b.active} onCheckedChange={(checked) => toggleActive(b.id, checked)} />
                <Button variant="ghost" size="icon" onClick={() => remove(b.id)} aria-label="Delete banner">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
          {(banners ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No banners yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
