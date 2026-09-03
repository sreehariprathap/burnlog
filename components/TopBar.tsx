// components/TopBar.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { XIcon, type XIconHandle } from '@/components/ui/x';
import { useMountAnimation } from '@/lib/useMountAnimation';
import { ThemeToggle } from './ThemeToggle';
import { AppSwitcher } from './AppSwitcher';
import { HeaderQuickInfo } from './HeaderQuickInfo';
import { BurnLogMark } from './BurnLogMark';
import { MoneyLogMark } from './MoneyLogMark';
import { TaskLogMark } from './TaskLogMark';
import { HomeLogMark } from './HomeLogMark';
import { SocialLogMark } from './SocialLogMark';
import { ShoppingLogMark } from './ShoppingLogMark';
import { LogbookMark } from './LogbookMark';
import { TravelLogMark } from './TravelLogMark';
import { LearnLogMark } from './LearnLogMark';
import { AdminLogMark } from './AdminLogMark';
import { IntelLogMark } from './IntelLogMark';
import { NotificationBell } from './NotificationBell';
import { APPS, AppId, getActiveApp, setEnabledApps, isAppId } from '@/lib/appMode';
import { createClient } from '@/lib/supabase/client';
import { resolveToggle } from '@/lib/adminlog/resolveToggle';

interface TopBarProps {
  title: string;
  onClose?: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ title, onClose, actions }: TopBarProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [activeApp, setActiveAppState] = useState<AppId>('logbook');
  const closeIconRef = useRef<XIconHandle>(null);
  useMountAnimation(closeIconRef);

  useEffect(() => {
    setActiveAppState(getActiveApp());
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, enabledApps, isAdmin')
        .eq('userId', session.user.id)
        .single();
      if (!profileRow) return;

      const rawEnabled = ((profileRow.enabledApps as string[]) ?? []).filter((v): v is AppId => isAppId(v));

      const appToggleKeys = Object.keys(APPS).map((id) => `app:${id}`);
      const [togglesRes, overridesRes] = await Promise.all([
        supabase.from('adminlog_toggles').select('key, type, globallyEnabled').in('key', appToggleKeys),
        supabase.from('adminlog_toggle_overrides').select('toggleKey, enabled').eq('profileId', profileRow.id),
      ]);
      const toggleByKey = new Map((togglesRes.data ?? []).map((t) => [t.key, t]));
      const overrideByKey = new Map((overridesRes.data ?? []).map((o) => [o.toggleKey, o]));

      const resolved = (Object.keys(APPS) as AppId[]).filter((id) => {
        // AdminLog isn't a user-toggleable app — it's gated purely on
        // profiles.isAdmin, bypassing the enabledApps/Toggle machinery.
        if (id === 'adminlog') return Boolean(profileRow.isAdmin);
        const toggle = toggleByKey.get(`app:${id}`);
        // An app with no Toggle row yet defaults to fully open (global on,
        // no override) — resolveToggle needs a row, so synthesize one.
        const effectiveToggle = toggle ?? { key: `app:${id}`, type: 'app' as const, globallyEnabled: true };
        const override = overrideByKey.get(`app:${id}`) ?? null;
        return resolveToggle(effectiveToggle, override, { enabledApps: rawEnabled });
      });

      setEnabledApps(resolved);
    })();
  }, []);

  return (
    <div
      className="w-full bg-background text-foreground shadow p-4 sticky top-0 z-10 relative flex justify-between"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <div className='flex gap-3 items-center'>
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          aria-label="Switch app"
          className="flex items-center justify-center"
        >
          {activeApp === 'logbook' ? (
            <LogbookMark size={20} />
          ) : activeApp === 'moneylog' ? (
            <MoneyLogMark size={20} />
          ) : activeApp === 'tasklog' ? (
            <TaskLogMark size={20} />
          ) : activeApp === 'homelog' ? (
            <HomeLogMark size={20} />
          ) : activeApp === 'sociallog' ? (
            <SocialLogMark size={20} />
          ) : activeApp === 'shoppinglog' ? (
            <ShoppingLogMark size={20} />
          ) : activeApp === 'travellog' ? (
            <TravelLogMark size={20} />
          ) : activeApp === 'learnlog' ? (
            <LearnLogMark size={20} />
          ) : activeApp === 'adminlog' ? (
            <AdminLogMark size={20} />
          ) : activeApp === 'intellog' ? (
            <IntelLogMark size={20} />
          ) : (
            <BurnLogMark size={20} />
          )}
        </button>
        <h1 className="font-header text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <NotificationBell />
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        {activeApp !== 'logbook' && <HeaderQuickInfo />}
        {onClose && (
          <button
            className="ml-2"
            onClick={onClose}
            aria-label="Close"
          >
            <XIcon ref={closeIconRef} size={24} />
          </button>
        )}
      </div>
      <AppSwitcher open={switcherOpen} onOpenChange={setSwitcherOpen} />
    </div>
  );
}
