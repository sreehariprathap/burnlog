'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { TopBar } from '@/components/TopBar';
import { Download, RotateCcw } from 'lucide-react';

type AppConfigShellProps = {
  appName: string;
  onboardingHref?: string;
  exportData: () => Record<string, unknown>;
  children: React.ReactNode;
  bottomNav: React.ReactNode;
};

export function AppConfigShell({
  appName,
  onboardingHref,
  exportData,
  children,
  bottomNav,
}: AppConfigShellProps) {
  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName.toLowerCase()}-config.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar title={`${appName} Config`} />
      <main className="flex-1 container mx-auto p-4 pb-24 space-y-6">
        {children}
        <div className="flex flex-col gap-3 pt-4 border-t">
          {onboardingHref && (
            <Button variant="outline" asChild>
              <Link href={onboardingHref}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Reonboard into {appName}
              </Link>
            </Button>
          )}
          <Button variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export config as JSON
          </Button>
        </div>
      </main>
      {bottomNav}
    </div>
  );
}
