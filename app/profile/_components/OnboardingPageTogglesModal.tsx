// app/profile/_components/OnboardingPageTogglesModal.tsx
'use client';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  const supabase = createClientComponentClient();
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Onboarding Pages</DialogTitle>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
