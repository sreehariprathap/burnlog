'use client';

import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ToggleRow = { key: string; type: 'app' | 'feature'; label: string; globallyEnabled: boolean };
type OverrideRow = { id: string; toggleKey: string; profileId: string; enabled: boolean; note: string | null };
type ProfileLite = { id: string; username: string };

export default function TogglesPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const supabase = createClient();

  const [toggles, setToggles] = useState<ToggleRow[]>([]);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [profilesById, setProfilesById] = useState<Record<string, ProfileLite>>({});
  const [loading, setLoading] = useState(true);

  const [newKey, setNewKey] = useState('');
  const [newType, setNewType] = useState<'app' | 'feature'>('feature');
  const [newLabel, setNewLabel] = useState('');

  const [overrideUsername, setOverrideUsername] = useState<Record<string, string>>({});
  const [overrideEnabled, setOverrideEnabled] = useState<Record<string, boolean>>({});
  const [overrideNote, setOverrideNote] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const [togglesRes, overridesRes] = await Promise.all([
      supabase.from('adminlog_toggles').select('key, type, label, globallyEnabled').order('key'),
      supabase.from('adminlog_toggle_overrides').select('id, toggleKey, profileId, enabled, note'),
    ]);
    const toggleRows = (togglesRes.data ?? []) as ToggleRow[];
    const overrideRows = (overridesRes.data ?? []) as OverrideRow[];
    setToggles(toggleRows);
    setOverrides(overrideRows);

    const profileIds = [...new Set(overrideRows.map((o) => o.profileId))];
    if (profileIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', profileIds);
      const byId: Record<string, ProfileLite> = {};
      for (const p of (profileRows ?? []) as ProfileLite[]) byId[p.id] = p;
      setProfilesById(byId);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (profile?.isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isAdmin]);

  async function handleGlobalToggle(key: string, next: boolean) {
    setToggles((prev) => prev.map((t) => (t.key === key ? { ...t, globallyEnabled: next } : t)));
    await supabase.from('adminlog_toggles').update({ globallyEnabled: next }).eq('key', key);
  }

  async function handleCreateToggle() {
    if (!newKey.trim() || !newLabel.trim()) return;
    const key = newType === 'app' ? `app:${newKey.trim()}` : `feature:${newKey.trim()}`;
    const { error } = await supabase
      .from('adminlog_toggles')
      .insert([{ key, type: newType, label: newLabel.trim(), globallyEnabled: true }]);
    if (!error) {
      setNewKey('');
      setNewLabel('');
      await load();
    }
  }

  async function handleAddOverride(toggleKey: string) {
    const username = overrideUsername[toggleKey]?.trim();
    if (!username) return;
    const { data: targetProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (!targetProfile) return;

    await supabase.from('adminlog_toggle_overrides').insert([
      {
        toggleKey,
        profileId: targetProfile.id,
        enabled: overrideEnabled[toggleKey] ?? true,
        note: overrideNote[toggleKey]?.trim() || null,
        setByAdminId: profile!.id,
      },
    ]);
    setOverrideUsername((prev) => ({ ...prev, [toggleKey]: '' }));
    setOverrideNote((prev) => ({ ...prev, [toggleKey]: '' }));
    await load();
  }

  async function handleRemoveOverride(id: string) {
    await supabase.from('adminlog_toggle_overrides').delete().eq('id', id);
    await load();
  }

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">App & Feature Toggles</h1>

      <Card>
        <CardHeader><CardTitle>Add a toggle</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Select value={newType} onValueChange={(v) => setNewType(v as 'app' | 'feature')}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="app">app:</SelectItem>
                <SelectItem value="feature">feature:</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="key (e.g. moneylog)" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
          </div>
          <Input placeholder="label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Button onClick={handleCreateToggle}>Add toggle</Button>
        </CardContent>
      </Card>

      {loading ? (
        <Loader2 className="animate-spin h-6 w-6 mx-auto" />
      ) : (
        toggles.map((toggle) => (
          <Card key={toggle.key}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{toggle.label} <span className="text-xs text-muted-foreground">({toggle.key})</span></CardTitle>
                <Switch
                  checked={toggle.globallyEnabled}
                  onCheckedChange={(checked) => handleGlobalToggle(toggle.key, checked)}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm font-medium">Per-user overrides</p>
              {overrides.filter((o) => o.toggleKey === toggle.key).map((o) => (
                <div key={o.id} className="flex items-center justify-between text-sm">
                  <span>
                    {profilesById[o.profileId]?.username ?? o.profileId} — {o.enabled ? 'forced on' : 'forced off'}
                    {o.note && <span className="text-muted-foreground"> ({o.note})</span>}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveOverride(o.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Username</Label>
                  <Input
                    value={overrideUsername[toggle.key] ?? ''}
                    onChange={(e) => setOverrideUsername((prev) => ({ ...prev, [toggle.key]: e.target.value }))}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label>On</Label>
                  <Switch
                    checked={overrideEnabled[toggle.key] ?? true}
                    onCheckedChange={(checked) => setOverrideEnabled((prev) => ({ ...prev, [toggle.key]: checked }))}
                  />
                </div>
                <Button onClick={() => handleAddOverride(toggle.key)}>Add</Button>
              </div>
              <Input
                placeholder="note (optional)"
                value={overrideNote[toggle.key] ?? ''}
                onChange={(e) => setOverrideNote((prev) => ({ ...prev, [toggle.key]: e.target.value }))}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
