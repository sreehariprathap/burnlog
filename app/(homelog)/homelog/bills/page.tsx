// app/(homelog)/homelog/bills/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { TopBar } from '@/components/TopBar';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Receipt, RefreshCw } from 'lucide-react';
import { useHouseholdMe } from '@/lib/homelog/useHouseholdMe';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/format';
import { expensesQuery, balancesQuery } from '@/lib/homelog/queries';

export default function BillsPage() {
  const { toast } = useToast();
  const { household, members, myProfileId, isLoading: householdLoading } = useHouseholdMe();
  const hasHousehold = !householdLoading && !!household;

  const {
    data: expenseData,
    isLoading: expensesLoading,
    mutate: refreshExpenses,
  } = useSWR(
    hasHousehold ? expensesQuery().key : null,
    hasHousehold ? expensesQuery().fetcher : null
  );
  const {
    data: balanceData,
    isLoading: balancesLoading,
    mutate: refreshBalances,
  } = useSWR(
    hasHousehold ? balancesQuery().key : null,
    hasHousehold ? balancesQuery().fetcher : null
  );

  const expenses = expenseData ?? [];
  const balances = balanceData ?? [];
  const loading = householdLoading || expensesLoading || balancesLoading;

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('groceries');
  const [totalAmount, setTotalAmount] = useState('');
  const [shares, setShares] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [settlingId, setSettlingId] = useState<string | null>(null);

  function updateShare(profileId: string, value: string) {
    setShares((prev) => ({ ...prev, [profileId]: value }));
  }

  const shareSum = Object.values(shares).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
  const totalNum = parseFloat(totalAmount) || 0;
  const sharesValid = totalNum > 0 && Math.abs(shareSum - totalNum) < 0.01;

  async function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      setError('Please enter a label');
      return;
    }
    if (!sharesValid) {
      setError('Shares must add up to the total amount');
      return;
    }
    setError('');
    setCreating(true);
    try {
      const splits = Object.entries(shares)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([profileId, v]) => ({ profileId, shareAmount: parseFloat(v) }));

      const res = await fetch('/api/homelog/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label.trim(), category, totalAmount: totalNum, splits }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to add expense');
      setLabel('');
      setTotalAmount('');
      setShares({});
      await refreshExpenses();
      await refreshBalances();
      toast({ title: 'Expense added' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add expense';
      setError(message);
      toast({ title: 'Failed to add expense', description: message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function handleSettle(toProfileId: string, amount: number) {
    setSettlingId(toProfileId);
    try {
      const res = await fetch('/api/homelog/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toProfileId, amount }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to settle up');
      }
      await refreshBalances();
      toast({ title: 'Settled up' });
    } catch (err) {
      toast({
        title: 'Failed to settle up',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setSettlingId(null);
    }
  }

  if (!householdLoading && !household) {
    return (
      <div className="pb-24">
        <TopBar title="Bills" />
        <div className="px-4 py-8 text-center text-muted-foreground">
          <p>You need a household first.</p>
          <Link href="/homelog" className="text-primary underline">
            Go to HomeLog home
          </Link>
        </div>
        <HomeLogBottomNav />
      </div>
    );
  }

  return (
    <div className="pb-24">
      <TopBar
        title="Bills"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            onClick={() => {
              refreshExpenses();
              refreshBalances();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />
      <div className="flex flex-col gap-4 px-4 py-4">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Balances</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(() => {
                  const myBalances = balances
                    .filter((b) => b.memberA === myProfileId || b.memberB === myProfileId)
                    .map((b) => {
                      const otherName = b.memberA === myProfileId ? b.memberBName : b.memberAName;
                      const otherId = b.memberA === myProfileId ? b.memberB : b.memberA;
                      // net > 0 means memberA owes memberB.
                      const iOwe = (b.memberA === myProfileId && b.net > 0) || (b.memberB === myProfileId && b.net < 0);
                      const amount = Math.abs(b.net);
                      return { key: `${b.memberA}-${b.memberB}`, otherId, otherName, iOwe, amount };
                    });

                  if (myBalances.length === 0) {
                    return <p className="text-sm text-muted-foreground">All settled up.</p>;
                  }

                  return myBalances.map((b) => (
                    <div key={b.key} className="flex items-center justify-between rounded-md border p-3">
                      <p className="text-sm">
                        {b.iOwe
                          ? `You owe ${b.otherName} ${formatCurrency(b.amount)}`
                          : `${b.otherName} owes you ${formatCurrency(b.amount)}`}
                      </p>
                      {b.iOwe && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSettle(b.otherId, b.amount)}
                          disabled={settlingId === b.otherId}
                        >
                          {settlingId === b.otherId ? 'Settling…' : 'Settle up'}
                        </Button>
                      )}
                    </div>
                  ));
                })()}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Add an expense</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateExpense} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="expense-label">Label</Label>
                    <Input
                      id="expense-label"
                      autoComplete="off"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="e.g. Dinner"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="expense-category">Category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger id="expense-category"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rent">Rent</SelectItem>
                          <SelectItem value="utilities">Utilities</SelectItem>
                          <SelectItem value="groceries">Groceries</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="expense-total">Total amount</Label>
                      <Input
                        id="expense-total"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Split ({members.length} members)</Label>
                    <div className="space-y-2">
                      {members.map((member) => (
                        <div key={member.profileId} className="flex items-center gap-2">
                          <Label htmlFor={`share-${member.profileId}`} className="w-24 truncate text-sm font-normal">
                            {member.firstName}
                          </Label>
                          <Input
                            id={`share-${member.profileId}`}
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={shares[member.profileId] ?? ''}
                            onChange={(e) => updateShare(member.profileId, e.target.value)}
                            placeholder="0.00"
                          />
                        </div>
                      ))}
                    </div>
                    <p className={`text-xs ${sharesValid ? 'text-muted-foreground' : 'text-destructive'}`}>
                      Shares total {formatCurrency(shareSum)} of {formatCurrency(totalNum)}
                    </p>
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" disabled={creating || !sharesValid}>
                    {creating ? 'Adding…' : 'Add expense'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent expenses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {expenses.length === 0 ? (
                  <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center">
                    <Receipt className="h-5 w-5 text-muted-foreground" />
                    <p className="text-sm font-semibold">No expenses logged yet</p>
                    <p className="text-xs text-muted-foreground">Add an expense above to start splitting bills.</p>
                  </div>
                ) : (
                  expenses.map((expense) => (
                    <div key={expense.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{expense.label}</p>
                        <p className="text-sm font-medium">{formatCurrency(expense.totalAmount)}</p>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">
                        {expense.category} · paid by {expense.paidByName}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <HomeLogBottomNav />
    </div>
  );
}
