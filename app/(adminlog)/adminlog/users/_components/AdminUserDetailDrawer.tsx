'use client';

import { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Wallet } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { apiFetch } from '@/lib/apiFetch';
import { APPS, type AppId } from '@/lib/appMode';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';

// Loose shape mirroring `profiles`' ~40 columns — only a handful are read
// or edited here; see useCurrentProfile's CurrentProfile for the same
// pattern applied to the caller's own row.
interface AdminUserDetail {
  id: string;
  userId: string;
  createdAt: string;
  username: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  isTestAccount: boolean;
  aiEnabled: boolean;
  enabledApps: AppId[];
  hasSeenAppTour: boolean;
  currentStreak: number;
  longestStreak: number;
  xp: number;
  level: number;
  [key: string]: unknown;
}

interface AdminUserDetailDrawerProps {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const APP_OPTIONS = (Object.keys(APPS) as AppId[]).filter((id) => id !== 'logbook' && id !== 'adminlog');

export function AdminUserDetailDrawer({ userId, onOpenChange, onSaved }: AdminUserDetailDrawerProps) {
  const { toast } = useToast();
  const [user, setUser] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [walletAmount, setWalletAmount] = useState('');
  const [walletMemo, setWalletMemo] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  useEffect(() => {
    if (!userId) {
      setUser(null);
      setBalance(null);
      setWalletAmount('');
      setWalletMemo('');
      return;
    }
    setLoading(true);
    (async () => {
      const res = await apiFetch(`/api/adminlog/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setBalance(typeof data.balance === 'number' ? data.balance : null);
      } else {
        toast({ title: 'Could not load user', variant: 'destructive' });
        onOpenChange(false);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  function toggleApp(app: AppId, checked: boolean) {
    if (!user) return;
    const next = checked
      ? [...user.enabledApps, app]
      : user.enabledApps.filter((a) => a !== app);
    setUser({ ...user, enabledApps: next });
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    const res = await apiFetch(`/api/adminlog/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        isTestAccount: user.isTestAccount,
        aiEnabled: user.aiEnabled,
        enabledApps: user.enabledApps,
      }),
    });
    setSaving(false);
    if (res.ok) {
      toast({ title: 'User updated' });
      onSaved();
    } else {
      const data = await res.json().catch(() => ({}));
      toast({ title: 'Could not save changes', description: data.error, variant: 'destructive' });
    }
  }

  async function handleResetOnboarding() {
    if (!user) return;
    setResetting(true);
    const res = await apiFetch(`/api/adminlog/users/${user.id}/reset-onboarding`, { method: 'POST' });
    setResetting(false);
    if (res.ok) {
      setUser({ ...user, hasSeenAppTour: false });
      toast({ title: 'Onboarding tour reset', description: "It'll replay on their next Logbook visit." });
      onSaved();
    } else {
      toast({ title: 'Could not reset onboarding', variant: 'destructive' });
    }
  }

  async function handleWalletAdjust(sign: 1 | -1) {
    if (!user) return;
    const parsed = Number(walletAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: 'Enter a positive amount', variant: 'destructive' });
      return;
    }
    setAdjusting(true);
    const res = await apiFetch(`/api/adminlog/users/${user.id}/wallet-adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parsed * sign, memo: walletMemo || undefined }),
    });
    setAdjusting(false);
    if (res.ok) {
      const data = await res.json();
      setBalance(data.balance);
      setWalletAmount('');
      setWalletMemo('');
      toast({ title: 'Wallet updated', description: `New balance: ${formatCurrency(data.balance)}` });
    } else {
      const data = await res.json().catch(() => ({}));
      toast({ title: 'Could not adjust wallet', description: data.error, variant: 'destructive' });
    }
  }

  return (
    <Drawer open={!!userId} onOpenChange={(open) => !open && onOpenChange(false)}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{user ? `${user.firstName} ${user.lastName}` : 'User'}</DrawerTitle>
        </DrawerHeader>

        <div className="px-4 pb-8 space-y-5 overflow-y-auto">
          {loading || !user ? (
            <Loader2 className="mx-auto h-6 w-6 animate-spin" />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={user.firstName}
                    onChange={(e) => setUser({ ...user, firstName: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={user.lastName}
                    onChange={(e) => setUser({ ...user, lastName: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={user.username}
                  onChange={(e) => setUser({ ...user, username: e.target.value })}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Joined {new Date(user.createdAt).toLocaleDateString()} · Lvl {user.level} · {user.currentStreak}🔥 current /{' '}
                {user.longestStreak}🔥 best · {user.xp} XP
              </p>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <Wallet className="h-4 w-4" />
                    Wallet balance
                  </p>
                  <p className="font-semibold tabular-nums">{balance !== null ? formatCurrency(balance) : '—'}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Adjustments post as a MoneyLog transaction and are immediately spendable (e.g. in ShoppingLog).
                </p>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Amount"
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    placeholder="Memo (optional)"
                    value={walletMemo}
                    onChange={(e) => setWalletMemo(e.target.value)}
                    className="flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="flex-1" disabled={adjusting} onClick={() => handleWalletAdjust(1)}>
                    {adjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                  </Button>
                  <Button type="button" variant="outline" className="flex-1" disabled={adjusting} onClick={() => handleWalletAdjust(-1)}>
                    {adjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Subtract'}
                  </Button>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="isAdmin">Admin</Label>
                  <Switch
                    id="isAdmin"
                    checked={user.isAdmin}
                    onCheckedChange={(checked) => setUser({ ...user, isAdmin: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="isTestAccount">Test account</Label>
                  <Switch
                    id="isTestAccount"
                    checked={user.isTestAccount}
                    onCheckedChange={(checked) => setUser({ ...user, isTestAccount: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="aiEnabled">AI enabled</Label>
                  <Switch
                    id="aiEnabled"
                    checked={user.aiEnabled}
                    onCheckedChange={(checked) => setUser({ ...user, aiEnabled: checked })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Enabled apps</Label>
                <div className="grid grid-cols-2 gap-2">
                  {APP_OPTIONS.map((app) => (
                    <label key={app} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={user.enabledApps.includes(app)}
                        onCheckedChange={(checked) => toggleApp(app, checked === true)}
                      />
                      {APPS[app].name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">Onboarding tour</p>
                  <p className="text-xs text-muted-foreground">
                    {user.hasSeenAppTour ? 'Already seen' : "Hasn't seen it yet"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetOnboarding}
                  disabled={resetting || !user.hasSeenAppTour}
                >
                  {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                  Reset
                </Button>
              </div>

              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
