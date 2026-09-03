// app/(moneylog)/moneylog/assets/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import useSWR from 'swr';
import { Loader2, Archive, Pencil, Repeat } from 'lucide-react';
import { format } from 'date-fns';
import { TopBar } from '@/components/TopBar';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiFetch } from '@/lib/apiFetch';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/format';
import { SIP_FREQUENCIES, sipFrequencyLabel } from '@/lib/moneylog/sipFrequency';
import { cn } from '@/lib/utils';

const AssetValueChart = dynamic(
  () => import('./_components/AssetValueChart').then((mod) => mod.AssetValueChart),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-muted" /> }
);

type Entry = { id: string; value: number; date: string; notes: string | null };
type AssetDetail = {
  id: string;
  name: string;
  category: string;
  value: number;
  investedValue: number | null;
  unrealizedIncome: number | null;
  expectedGrowthRate: number | null;
  sipEnabled: boolean;
  sipAmount: number | null;
  sipFrequency: string | null;
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load history');
  return res.json();
}

export default function AssetDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data, isLoading } = useSWR<{ entries: Entry[] }>(
    `/api/moneylog/assets/${params.id}/entries`,
    fetcher
  );
  const { data: assetData, mutate: mutateAsset } = useSWR<{ asset: AssetDetail }>(
    `/api/moneylog/assets/${params.id}`,
    fetcher
  );
  const asset = assetData?.asset;

  const [editing, setEditing] = useState(false);
  const [editInvestedValue, setEditInvestedValue] = useState('');
  const [editGrowthRate, setEditGrowthRate] = useState('');
  const [editSipEnabled, setEditSipEnabled] = useState(false);
  const [editSipAmount, setEditSipAmount] = useState('');
  const [editSipFrequency, setEditSipFrequency] = useState('monthly');
  const [savingEdit, setSavingEdit] = useState(false);

  const startEdit = () => {
    if (!asset) return;
    setEditInvestedValue(asset.investedValue != null ? String(asset.investedValue) : '');
    setEditGrowthRate(asset.expectedGrowthRate != null ? String(asset.expectedGrowthRate) : '');
    setEditSipEnabled(asset.sipEnabled);
    setEditSipAmount(asset.sipAmount != null ? String(asset.sipAmount) : '');
    setEditSipFrequency(asset.sipFrequency ?? 'monthly');
    setEditing(true);
  };

  const saveEdit = async () => {
    if (editSipEnabled && (!editSipAmount || !Number.isFinite(Number(editSipAmount)) || Number(editSipAmount) <= 0)) {
      toast({ variant: 'destructive', title: 'Enter a valid SIP amount' });
      return;
    }
    setSavingEdit(true);
    const res = await apiFetch(`/api/moneylog/assets/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        investedValue: editInvestedValue ? Number(editInvestedValue) : null,
        expectedGrowthRate: editGrowthRate ? Number(editGrowthRate) : null,
        sipEnabled: editSipEnabled,
        sipAmount: editSipEnabled ? Number(editSipAmount) : null,
        sipFrequency: editSipEnabled ? editSipFrequency : null,
      }),
    });
    setSavingEdit(false);
    if (res.ok) {
      toast({ title: 'Asset updated' });
      setEditing(false);
      mutateAsset();
    } else {
      toast({ variant: 'destructive', title: 'Failed to update asset' });
    }
  };

  const entries = data?.entries ?? [];
  const chartData = entries.map((e) => ({ date: format(new Date(e.date), 'MMM d'), value: e.value }));

  const archive = async () => {
    if (!window.confirm('Archive this asset? Its history is kept but it will leave your asset list.')) return;
    const res = await apiFetch(`/api/moneylog/assets/${params.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast({ title: 'Asset archived' });
      router.push('/moneylog/assets');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar
        title="Asset History"
        actions={
          <Button variant="ghost" size="icon" aria-label="Archive asset" onClick={archive}>
            <Archive className="size-4" />
          </Button>
        }
      />
      <main className="flex-1 container mx-auto max-w-2xl space-y-4 p-4 pb-8">
        {asset && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Growth & Contributions</CardTitle>
              {!editing && (
                <Button variant="ghost" size="icon" aria-label="Edit growth details" onClick={startEdit}>
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editing ? (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-invested">Invested amount</Label>
                    <Input
                      id="edit-invested"
                      type="number"
                      min="0"
                      step="0.01"
                      value={editInvestedValue}
                      onChange={(e) => setEditInvestedValue(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-growth-rate">Expected annual growth rate %</Label>
                    <Input
                      id="edit-growth-rate"
                      type="number"
                      step="0.1"
                      value={editGrowthRate}
                      onChange={(e) => setEditGrowthRate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-sip-enabled">SIP enrolled</Label>
                    <Switch id="edit-sip-enabled" checked={editSipEnabled} onCheckedChange={setEditSipEnabled} />
                  </div>
                  {editSipEnabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-sip-amount">SIP amount</Label>
                        <Input
                          id="edit-sip-amount"
                          type="number"
                          min="0"
                          step="0.01"
                          value={editSipAmount}
                          onChange={(e) => setEditSipAmount(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-sip-frequency">Frequency</Label>
                        <Select value={editSipFrequency} onValueChange={setEditSipFrequency}>
                          <SelectTrigger id="edit-sip-frequency">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {SIP_FREQUENCIES.map((f) => (
                              <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Button onClick={saveEdit} disabled={savingEdit}>{savingEdit ? 'Saving…' : 'Save'}</Button>
                    <Button variant="outline" onClick={() => setEditing(false)} disabled={savingEdit}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  {asset.investedValue != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Invested</span>
                      <span className="tabular-nums">{formatCurrency(asset.investedValue)}</span>
                    </div>
                  )}
                  {asset.unrealizedIncome != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Unrealized income</span>
                      <span className={cn('tabular-nums font-semibold', asset.unrealizedIncome >= 0 ? 'text-success' : 'text-destructive')}>
                        {asset.unrealizedIncome >= 0 ? '+' : ''}{formatCurrency(asset.unrealizedIncome)}
                      </span>
                    </div>
                  )}
                  {asset.expectedGrowthRate != null && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expected annual growth</span>
                      <span className="tabular-nums">{asset.expectedGrowthRate}%</span>
                    </div>
                  )}
                  {asset.sipEnabled && asset.sipAmount != null && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1"><Repeat className="h-3.5 w-3.5" />SIP</span>
                      <span className="tabular-nums">{formatCurrency(asset.sipAmount)} / {sipFrequencyLabel(asset.sipFrequency ?? '').toLowerCase()}</span>
                    </div>
                  )}
                  {asset.investedValue == null && asset.expectedGrowthRate == null && !asset.sipEnabled && (
                    <p className="text-muted-foreground">No growth details yet — tap edit to add them.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
        {isLoading && <Loader2 className="h-6 w-6 animate-spin" />}
        {!isLoading && entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No balance history yet.</p>
        )}
        {!isLoading && entries.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Value Over Time</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                <AssetValueChart data={chartData} />
              </CardContent>
            </Card>
            <div className="space-y-2">
              {[...entries].reverse().map((entry) => (
                <Card key={entry.id}>
                  <CardContent className="flex items-center justify-between p-3">
                    <div>
                      <p className="text-sm font-medium">{format(new Date(entry.date), 'MMM d, yyyy')}</p>
                      {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                    </div>
                    <p className="text-sm font-semibold tabular-nums">{formatCurrency(entry.value)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
