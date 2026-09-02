'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Loader2, Bell, Settings, Cpu, Bug } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { sendRealTestNotification } from '@/lib/pushNotification';
import { NOTIFICATION_TEMPLATES, templatesByApp, type NotificationTemplate } from '@/lib/notificationTemplates';
import { PushEnableHelp } from '@/components/PushEnableHelp';
import { isDevErrorModeEnabled, setDevErrorModeEnabled } from '@/lib/devErrorMode';
import { OnboardingPageTogglesModal } from './_components/OnboardingPageTogglesModal';
import { AiModelSettingsModal } from './_components/AiModelSettingsModal';

export default function AdminToolsPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const { toast } = useToast();

  const [testSending, setTestSending] = useState(false);
  const [testPushFailed, setTestPushFailed] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(NOTIFICATION_TEMPLATES[0].id);
  const [showPageToggles, setShowPageToggles] = useState(false);
  const [showAiModelSettings, setShowAiModelSettings] = useState(false);
  const [devErrorMode, setDevErrorMode] = useState(() => isDevErrorModeEnabled());

  const handleSendTestPush = async () => {
    const template = NOTIFICATION_TEMPLATES.find((t) => t.id === selectedTemplateId);
    if (!template) return;
    setTestSending(true);
    setTestPushFailed(false);
    try {
      const result = await sendRealTestNotification({ title: template.title, message: template.message, url: template.url });
      if (result.success) {
        toast({ description: 'Test push sent — check for a real notification on this device.' });
      } else {
        toast({ title: 'Test push failed', description: result.error || 'Unknown error', variant: 'destructive' });
        setTestPushFailed(true);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      toast({ title: 'Test push failed', description: message, variant: 'destructive' });
      setTestPushFailed(true);
    }
    setTestSending(false);
  };

  const selectedTemplate: NotificationTemplate | undefined = NOTIFICATION_TEMPLATES.find((t) => t.id === selectedTemplateId);
  const groupedTemplates = templatesByApp();

  if (profileLoading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Admin Tools</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-warning" />
            Test Push Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Admin tool - pick a notification type and send yourself a real push to verify delivery and copy.
          </p>

          <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a notification type" />
            </SelectTrigger>
            <SelectContent>
              {groupedTemplates.map((group) => (
                <SelectGroup key={group.app}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          {selectedTemplate && (
            <div className="rounded-lg border bg-muted/40 p-3 flex gap-3 items-start">
              <Image src="/icons/icon-48.png" alt="" width={48} height={48} className="w-8 h-8 rounded-md shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{selectedTemplate.title}</p>
                <p className="text-sm text-muted-foreground">{selectedTemplate.message}</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Opens: {selectedTemplate.url}</p>
              </div>
            </div>
          )}

          <Button onClick={handleSendTestPush} disabled={testSending}>
            {testSending ? 'Sending...' : 'Send Test Push'}
          </Button>

          {testPushFailed && <PushEnableHelp />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-warning" />
            Onboarding Pages
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Admin tool - control which advanced onboarding pages are shown to everyone
            in the AI setup flow.
          </p>
          <Button variant="outline" onClick={() => setShowPageToggles(true)}>
            <Settings className="w-4 h-4 mr-2" />
            Manage Pages
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-warning" />
            AI Model Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Admin tool - choose which free OpenRouter model powers text and image AI features.
          </p>
          <Button variant="outline" onClick={() => setShowAiModelSettings(true)}>
            <Cpu className="w-4 h-4 mr-2" />
            Manage Models
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bug className="w-5 h-5 text-warning" />
            Developer Error Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Show error details in a modal</p>
              <p className="text-xs text-muted-foreground">
                Admin tool - on this device, pop up the full message and stack trace for
                any error (render errors, failed API calls, uncaught exceptions) instead
                of only logging to the console.
              </p>
            </div>
            <Switch
              checked={devErrorMode}
              onCheckedChange={(checked) => {
                setDevErrorMode(checked);
                setDevErrorModeEnabled(checked);
              }}
            />
          </div>
        </CardContent>
      </Card>

      <OnboardingPageTogglesModal open={showPageToggles} onOpenChange={setShowPageToggles} />
      <AiModelSettingsModal open={showAiModelSettings} onOpenChange={setShowAiModelSettings} />
    </div>
  );
}
