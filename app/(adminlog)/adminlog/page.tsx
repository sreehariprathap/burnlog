'use client';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

const SECTIONS = [
  { href: '/adminlog/toggles', label: 'App & Feature Toggles', description: 'Turn apps and beta features on/off globally or per-user.' },
  { href: '/adminlog/errors', label: 'Error Log', description: 'Browse persisted client, server, and background job errors.' },
  { href: '/adminlog/invites', label: 'Invites', description: 'Send and track invites to new users.' },
  { href: '/adminlog/tools', label: 'Admin Tools', description: 'Test push notifications, onboarding pages.' },
  { href: '/adminlog/ai-models', label: 'AI Model Mapping', description: 'Choose which OpenRouter model powers each AI feature across the app.' },
  { href: '/adminlog/ai-model-test', label: 'AI Model Test', description: 'Ask a fixed test question to any free model and compare latency, throughput, and response quality.' },
  { href: '/adminlog/test-onboarding', label: 'Test Onboarding', description: 'Run the real onboarding flow as a disposable test account.' },
];

export default function AdminLogDashboard() {
  const { profile, loading } = useRequireAdmin();

  if (loading || !profile?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">AdminLog</h1>
      <div className="grid gap-4">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href}>
            <Card className="hover:bg-muted/40 transition-colors">
              <CardHeader>
                <CardTitle>{section.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{section.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
