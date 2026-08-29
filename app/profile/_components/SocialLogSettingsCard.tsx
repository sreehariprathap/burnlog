'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/sociallog/apiFetch';

type WhoCanMessage = 'everyone' | 'followers' | 'none';

type Settings = {
  bio: string | null;
  isPrivate: boolean;
  whoCanMessage: WhoCanMessage;
  showCrossAppActivity: boolean;
};

export function SocialLogSettingsCard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [bioInput, setBioInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await apiFetch('/api/sociallog/profile-settings');
      if (res.ok) {
        const data: Settings = await res.json();
        setSettings(data);
        setBioInput(data.bio ?? '');
      }
      setLoading(false);
    })();
  }, []);

  const patch = async (update: Partial<Settings>) => {
    setSaving(true);
    const res = await apiFetch('/api/sociallog/profile-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(update),
    });
    if (res.ok) {
      const data: Settings = await res.json();
      setSettings(data);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>SocialLog</CardTitle>
        </CardHeader>
        <CardContent>
          <Loader2 className="h-5 w-5 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!settings) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>SocialLog</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Bio</p>
          <Textarea
            value={bioInput}
            onChange={(e) => setBioInput(e.target.value)}
            onBlur={() => {
              if (bioInput !== (settings.bio ?? '')) patch({ bio: bioInput });
            }}
            placeholder="Tell people about yourself"
            maxLength={280}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Private account</p>
            <p className="text-xs text-muted-foreground">Only approved followers see your posts</p>
          </div>
          <Switch
            checked={settings.isPrivate}
            onCheckedChange={(checked) => patch({ isPrivate: checked })}
            disabled={saving}
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Who can message me</p>
          </div>
          <Select
            value={settings.whoCanMessage}
            onValueChange={(value) => patch({ whoCanMessage: value as WhoCanMessage })}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="everyone">Everyone</SelectItem>
              <SelectItem value="followers">Followers</SelectItem>
              <SelectItem value="none">No one</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Show cross-app activity</p>
            <p className="text-xs text-muted-foreground">Let your BurnLog/TaskLog/HomeLog/LifeLog milestones post here</p>
          </div>
          <Switch
            checked={settings.showCrossAppActivity}
            onCheckedChange={(checked) => patch({ showCrossAppActivity: checked })}
            disabled={saving}
          />
        </div>
      </CardContent>
    </Card>
  );
}
