// app/profile/_components/OnboardingPageTogglesModal.tsx
'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

type PageFlag = {
  pageKey: string;
  label: string;
  isEnabled: boolean;
};

type OnboardingPageTogglesModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function OnboardingPageTogglesModal({ open, onOpenChange }: OnboardingPageTogglesModalProps) {
  const supabase = createClient();
  const [flags, setFlags] = useState<PageFlag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('onboarding_page_flags')
        .select('pageKey, label, isEnabled')
        .order('pageKey');
      setFlags(data ?? []);
      setLoading(false);
    })();
  }, [open, supabase]);

  const handleToggle = async (pageKey: string, next: boolean) => {
    setFlags((prev) => prev.map((f) => (f.pageKey === pageKey ? { ...f, isEnabled: next } : f)));
    await supabase.from('onboarding_page_flags').update({ isEnabled: next }).eq('pageKey', pageKey);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Onboarding Pages</DrawerTitle>
        </DrawerHeader>
        <div className="px-4 pb-6">
          {loading ? (
            <Loader2 className="animate-spin h-6 w-6 mx-auto" />
          ) : (
            <div className="space-y-4">
              {flags.map((flag) => (
                <div key={flag.pageKey} className="flex items-center justify-between">
                  <Label htmlFor={`flag-${flag.pageKey}`}>{flag.label}</Label>
                  <Switch
                    id={`flag-${flag.pageKey}`}
                    checked={flag.isEnabled}
                    onCheckedChange={(checked) => handleToggle(flag.pageKey, checked)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
