'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MODEL_TEST_PRESET_LIST, type ModelTestPresetId } from '@/lib/ai/modelTestPresets';

type CatalogEntry = { id: string; name: string };

type TestRun = {
  id: string;
  model: string | null;
  input: { preset?: ModelTestPresetId } | null;
  output: { text?: string; promptTokens?: number | null; completionTokens?: number | null } | null;
  status: string;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
};

function tokensPerSec(run: TestRun): string {
  const tokens = run.output?.completionTokens;
  if (!tokens || !run.durationMs) return '—';
  return (tokens / (run.durationMs / 1000)).toFixed(1);
}

export default function AiModelTestPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();

  const [models, setModels] = useState<CatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [preset, setPreset] = useState<ModelTestPresetId>('small');

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<TestRun['output'] | null>(null);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);

  const [history, setHistory] = useState<TestRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      try {
        const res = await fetch('/api/ai/models');
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? 'Failed to load model catalog');
        const text = (data.text ?? []) as CatalogEntry[];
        setModels(text);
        if (text.length > 0) setSelectedModel((prev) => prev || text[0].id);
      } catch (err) {
        setCatalogError(err instanceof Error ? err.message : 'Failed to load model catalog');
      }
    })();
  }, [profile?.isAdmin]);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/ai/model-test');
      const data = await res.json();
      if (res.ok) setHistory(data.runs ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (!profile?.isAdmin) return;
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isAdmin]);

  async function runTest() {
    if (!selectedModel) return;
    setRunning(true);
    setRunError(null);
    setLastResult(null);
    setLastDurationMs(null);
    const start = Date.now();
    try {
      const res = await fetch('/api/ai/model-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: selectedModel, preset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Test failed');
      setLastResult(data);
      setLastDurationMs(Date.now() - start);
      loadHistory();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Test failed');
      loadHistory();
    } finally {
      setRunning(false);
    }
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
      <div>
        <h1 className="text-2xl font-semibold">AI Model Test</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ask a fixed test question to any free OpenRouter model and see how it responds, how
          long it took, and its throughput — to track which model is actually good.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Run a test</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {catalogError && <p className="text-sm text-destructive">{catalogError}</p>}

          <div className="space-y-1.5">
            <Label htmlFor="model-select">Model</Label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={models.length === 0}>
              <SelectTrigger id="model-select" className="w-full">
                <SelectValue placeholder={models.length === 0 ? 'No free models available' : undefined} />
              </SelectTrigger>
              <SelectContent>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="preset-select">Test</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as ModelTestPresetId)}>
              <SelectTrigger id="preset-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODEL_TEST_PRESET_LIST.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {MODEL_TEST_PRESET_LIST.find((p) => p.id === preset)?.description}
            </p>
          </div>

          <Button onClick={runTest} disabled={running || !selectedModel}>
            {running && <Loader2 className="animate-spin" />}
            {running ? 'Running…' : 'Run test'}
          </Button>

          {runError && <p className="text-sm text-destructive">{runError}</p>}

          {lastResult && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <Badge variant="secondary">{lastDurationMs}ms</Badge>
                {lastResult.promptTokens != null && (
                  <Badge variant="secondary">{lastResult.promptTokens} prompt tokens</Badge>
                )}
                {lastResult.completionTokens != null && (
                  <Badge variant="secondary">{lastResult.completionTokens} completion tokens</Badge>
                )}
                {lastResult.completionTokens != null && lastDurationMs && (
                  <Badge variant="secondary">
                    {(lastResult.completionTokens / (lastDurationMs / 1000)).toFixed(1)} tok/s
                  </Badge>
                )}
              </div>
              <Textarea readOnly value={lastResult.text ?? ''} className="min-h-32" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <Loader2 className="animate-spin h-5 w-5 mx-auto" />
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No test runs yet.</p>
          ) : (
            <div className="space-y-2">
              {history.map((run) => (
                <div key={run.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
                  <Badge variant={run.status === 'success' ? 'default' : 'destructive'}>
                    {run.status === 'success' ? '✓' : '✗'}
                  </Badge>
                  <span className="font-medium">{run.model}</span>
                  <span className="text-muted-foreground">
                    {MODEL_TEST_PRESET_LIST.find((p) => p.id === run.input?.preset)?.label ?? run.input?.preset}
                  </span>
                  <span className="text-muted-foreground">{run.durationMs != null ? `${run.durationMs}ms` : '—'}</span>
                  <span className="text-muted-foreground">{tokensPerSec(run)} tok/s</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                  {run.error && <p className="w-full text-xs text-destructive">{run.error}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
