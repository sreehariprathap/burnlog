// app/(homelog)/homelog/bills/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TopBar } from '@/components/TopBar';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MemberInfo {
  profileId: string;
  firstName: string;
}

interface ExpenseSplitInfo {
  profileId: string;
  name: string;
  shareAmount: number;
}

interface ExpenseInfo {
  id: string;
  label: string;
  category: string;
  totalAmount: number;
  paidByProfileId: string;
  paidByName: string;
  date: string;
  splits: ExpenseSplitInfo[];
}

interface BalanceInfo {
  memberA: string;
  memberAName: string;
  memberB: string;
  memberBName: string;
  net: number;
}

export default function BillsPage() {
  const [inHousehold, setInHousehold] = useState<boolean | null>(null);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberInfo[]>([]);
  const [expenses, setExpenses] = useState<ExpenseInfo[]>([]);
  const [balances, setBalances] = useState<BalanceInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('groceries');
  const [totalAmount, setTotalAmount] = useState('');
  const [shares, setShares] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const meRes = await fetch('/api/homelog/households/me');
    const meBody = await meRes.json();
    if (!meBody.household) {
      setInHousehold(false);
      setLoading(false);
      return;
    }
    setInHousehold(true);
    setMembers(meBody.members ?? []);
    setMyProfileId(meBody.myProfileId ?? null);

    const [expensesRes, balancesRes] = await Promise.all([
      fetch('/api/homelog/expenses'),
      fetch('/api/homelog/balances'),
    ]);
    const expensesBody = await expensesRes.json();
    const balancesBody = await balancesRes.json();
    setExpenses(expensesBody.expenses ?? []);
    setBalances(balancesBody.balances ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add expense');
    } finally {
      setCreating(false);
    }
  }

  async function handleSettle(toProfileId: string, amount: number) {
    await fetch('/api/homelog/settlements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toProfileId, amount }),
    });
    await refresh();
  }

  if (inHousehold === false) {
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
      <TopBar title="Bills" />
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
                          ? `You owe ${b.otherName} $${b.amount.toFixed(2)}`
                          : `${b.otherName} owes you $${b.amount.toFixed(2)}`}
                      </p>
                      {b.iOwe && (
                        <Button type="button" size="sm" onClick={() => handleSettle(b.otherId, b.amount)}>
                          Settle up
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
                    <Label>Label</Label>
                    <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Dinner" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rent">Rent</SelectItem>
                          <SelectItem value="utilities">Utilities</SelectItem>
                          <SelectItem value="groceries">Groceries</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Total amount</Label>
                      <Input
                        type="number"
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
                          <span className="w-24 text-sm">{member.firstName}</span>
                          <Input
                            type="number"
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
                      Shares total ${shareSum.toFixed(2)} of ${totalNum.toFixed(2)}
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
                  <p className="text-sm text-muted-foreground">No expenses logged yet.</p>
                ) : (
                  expenses.map((expense) => (
                    <div key={expense.id} className="rounded-md border p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{expense.label}</p>
                        <p className="text-sm font-medium">${expense.totalAmount.toFixed(2)}</p>
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
