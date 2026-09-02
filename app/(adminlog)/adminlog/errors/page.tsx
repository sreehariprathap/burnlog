'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type ErrorRow = {
  id: string;
  source: string;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
};

type SourceFilter = 'all' | 'client' | 'server' | 'worker';
type StatusFilter = 'unresolved' | 'resolved' | 'all';

export default function ErrorsPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();
  const supabase = createClient();

  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unresolved');

  async function load() {
    setLoading(true);
    let query = supabase
      .from('adminlog_error_logs')
      .select('id, source, message, stack, context, createdAt, resolvedAt')
      .order('createdAt', { ascending: false })
      .limit(100);

    if (sourceFilter !== 'all') query = query.eq('source', sourceFilter);
    if (statusFilter === 'unresolved') query = query.is('resolvedAt', null);
    if (statusFilter === 'resolved') query = query.not('resolvedAt', 'is', null);

    const { data } = await query;
    setRows((data ?? []) as ErrorRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (profile?.isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isAdmin, sourceFilter, statusFilter]);

  async function handleResolve(id: string) {
    await supabase
      .from('adminlog_error_logs')
      .update({ resolvedAt: new Date().toISOString(), resolvedByAdminId: profile!.id })
      .eq('id', id);
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
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Error Log</h1>

      <div className="flex gap-2">
        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as SourceFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="server">Server</SelectItem>
            <SelectItem value="worker">Worker</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="unresolved">Unresolved</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <Loader2 className="animate-spin h-6 w-6 mx-auto" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No errors match this filter.</p>
      ) : (
        rows.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  <span className="uppercase text-xs text-muted-foreground mr-2">{row.source}</span>
                  {row.message}
                </CardTitle>
                {!row.resolvedAt && (
                  <Button variant="outline" size="sm" onClick={() => handleResolve(row.id)}>
                    <Check className="h-4 w-4 mr-1" /> Resolve
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{new Date(row.createdAt).toLocaleString()}</p>
              {row.context && (
                <pre className="text-xs bg-muted p-2 rounded overflow-auto">{JSON.stringify(row.context, null, 2)}</pre>
              )}
              {row.stack && (
                <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">{row.stack}</pre>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
