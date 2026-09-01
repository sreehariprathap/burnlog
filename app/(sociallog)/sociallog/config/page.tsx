'use client';

import { useState } from 'react';
import { AppConfigShell } from '@/components/AppConfigShell';
import { SocialLogBottomNav } from '@/components/SocialLogBottomNav';
import { SocialLogSettingsCard } from './_components/SocialLogSettingsCard';

export default function SocialLogConfigPage() {
  const [exportSnapshot, setExportSnapshot] = useState<Record<string, unknown>>({});

  return (
    <AppConfigShell
      appName="SocialLog"
      exportData={() => exportSnapshot}
      bottomNav={<SocialLogBottomNav />}
    >
      <SocialLogSettingsCard onSettingsLoaded={setExportSnapshot} />
    </AppConfigShell>
  );
}
