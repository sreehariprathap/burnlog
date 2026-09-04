'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useRequireAdmin } from '@/lib/adminlog/useRequireAdmin';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BrowsableOpenRouterModel } from '@/lib/intellog/openrouterModels';

type PricingFilter = 'all' | 'free' | 'paid';
type ModalityFilter = 'all' | 'text' | 'vision';

type CuratedRow = { modelId: string };

function formatContextLength(n: number | null): string {
  if (n == null) return '—';
  return n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
}

export default function ModelGatherPage() {
  const { profile, loading: profileLoading } = useRequireAdmin();

  const [browseModels, setBrowseModels] = useState<BrowsableOpenRouterModel[]>([]);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [curatedIds, setCuratedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const [search, setSearch] = useState('');
  const [modality, setModality] = useState<ModalityFilter>('all');
  const [provider, setProvider] = useState<string>('all');
  const [pricing, setPricing] = useState<PricingFilter>('all');
  const [minContextK, setMinContextK] = useState('');

  useEffect(() => {
    if (!profile?.isAdmin) return;
    (async () => {
      setBrowseLoading(true);
      setBrowseError(null);
      try {
        const [browseRes, curatedRes] = await Promise.all([
          fetch('/api/adminlog/model-catalog/browse'),
          fetch('/api/adminlog/model-catalog'),
        ]);
        const browseData = await browseRes.json();
        if (!browseRes.ok || browseData.error) throw new Error(browseData.error ?? 'Failed to load OpenRouter catalog');
        setBrowseModels(browseData.models ?? []);

        const curatedData = await curatedRes.json();
        if (curatedRes.ok) {
          setCuratedIds(new Set((curatedData.models as CuratedRow[]).map((m) => m.modelId)));
        }
      } catch (err) {
        setBrowseError(err instanceof Error ? err.message : 'Failed to load models');
      } finally {
        setBrowseLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.isAdmin]);

  const providers = useMemo(
    () => [...new Set(browseModels.map((m) => m.provider))].sort(),
    [browseModels]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minContext = minContextK.trim() ? Number(minContextK) * 1000 : null;
    return browseModels.filter((m) => {
      if (q && !m.id.toLowerCase().includes(q) && !m.name.toLowerCase().includes(q)) return false;
      if (modality !== 'all' && m.modality !== modality) return false;
      if (provider !== 'all' && m.provider !== provider) return false;
      if (pricing === 'free' && !m.isFree) return false;
      if (pricing === 'paid' && m.isFree) return false;
      if (minContext != null && (m.contextLength == null || m.contextLength < minContext)) return false;
      return true;
    });
  }, [browseModels, search, modality, provider, pricing, minContextK]);

  async function toggleCurated(model: BrowsableOpenRouterModel) {
    const isCurated = curatedIds.has(model.id);
    setPendingIds((prev) => new Set(prev).add(model.id));

    const rollback = new Set(curatedIds);
    setCuratedIds((prev) => {
      const next = new Set(prev);
      if (isCurated) next.delete(model.id);
      else next.add(model.id);
      return next;
    });

    try {
      const res = isCurated
        ? await fetch('/api/adminlog/model-catalog', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: model.id }),
          })
        : await fetch('/api/adminlog/model-catalog', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ modelId: model.id }),
          });
      if (!res.ok) throw new Error('request failed');
    } catch {
      setCuratedIds(rollback);
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(model.id);
        return next;
      });
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
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <p className="text-sm text-muted-foreground mt-1">
          Browse OpenRouter&rsquo;s full catalog and curate which models are available across the
          app. Curated models show up in every model picker (the per-feature AI mapping below, and
          IntelLog chat).
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap gap-3 p-4">
          <Input
            placeholder="Search name or id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select value={modality} onValueChange={(v) => setModality(v as ModalityFilter)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All modalities</SelectItem>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="vision">Vision</SelectItem>
            </SelectContent>
          </Select>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={pricing} onValueChange={(v) => setPricing(v as PricingFilter)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Free & paid</SelectItem>
              <SelectItem value="free">Free only</SelectItem>
              <SelectItem value="paid">Paid only</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            placeholder="Min context (K)"
            value={minContextK}
            onChange={(e) => setMinContextK(e.target.value)}
            className="w-36"
          />
        </CardContent>
      </Card>

      {browseError && <p className="text-sm text-destructive">{browseError}</p>}

      {browseLoading ? (
        <Loader2 className="animate-spin h-6 w-6 mx-auto" />
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{filtered.length} of {browseModels.length} models</p>
          {filtered.map((m) => {
            const isCurated = curatedIds.has(m.id);
            const isPending = pendingIds.has(m.id);
            return (
              <Card key={m.id}>
                <CardContent className="flex flex-col gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.id}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="secondary">{m.provider}</Badge>
                    <Badge variant="outline">{m.modality}</Badge>
                    <Badge variant={m.isFree ? 'default' : 'secondary'}>{m.isFree ? 'Free' : 'Paid'}</Badge>
                    <Badge variant="outline">{formatContextLength(m.contextLength)}</Badge>
                    <Link
                      href={`/adminlog/ai-model-test?model=${encodeURIComponent(m.id)}`}
                      className="text-xs text-primary underline"
                    >
                      Test speed →
                    </Link>
                    <Button
                      size="sm"
                      variant={isCurated ? 'destructive' : 'default'}
                      disabled={isPending}
                      onClick={() => toggleCurated(m)}
                    >
                      {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : isCurated ? 'Remove' : 'Add'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
