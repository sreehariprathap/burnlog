// app/(homelog)/homelog/inventory/page.tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  lowStockThreshold: number;
  status: 'in_stock' | 'low' | 'out';
}

interface ShoppingItem {
  id: string;
  label: string;
  addedByName: string;
  inventoryItemId: string | null;
}

const STATUS_LABEL: Record<InventoryItem['status'], string> = {
  in_stock: 'In stock',
  low: 'Low',
  out: 'Out',
};

export default function InventoryPage() {
  const [inHousehold, setInHousehold] = useState<boolean | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [shoppingItems, setShoppingItems] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('pantry');
  const [quantity, setQuantity] = useState('1');
  const [threshold, setThreshold] = useState('1');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const [shoppingLabel, setShoppingLabel] = useState('');

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
    const [inventoryRes, shoppingRes] = await Promise.all([
      fetch('/api/homelog/inventory'),
      fetch('/api/homelog/shopping-list'),
    ]);
    const inventoryBody = await inventoryRes.json();
    const shoppingBody = await shoppingRes.json();
    setItems(inventoryBody.items ?? []);
    setShoppingItems(shoppingBody.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Please enter an item name');
      return;
    }
    setError('');
    setAdding(true);
    try {
      const res = await fetch('/api/homelog/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          category,
          quantity: Number(quantity),
          lowStockThreshold: Number(threshold),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to add item');
      setName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setAdding(false);
    }
  }

  async function handleAdjust(id: string, delta: number) {
    await fetch(`/api/homelog/inventory/${id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta }),
    });
    await refresh();
  }

  async function handleDeleteItem(id: string) {
    await fetch(`/api/homelog/inventory/${id}`, { method: 'DELETE' });
    await refresh();
  }

  async function handleAddShoppingItem(e: React.FormEvent) {
    e.preventDefault();
    if (!shoppingLabel.trim()) return;
    await fetch('/api/homelog/shopping-list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: shoppingLabel.trim() }),
    });
    setShoppingLabel('');
    await refresh();
  }

  async function handleCheckOff(id: string) {
    await fetch(`/api/homelog/shopping-list/${id}/check`, { method: 'POST' });
    await refresh();
  }

  async function handleRemoveShoppingItem(id: string) {
    await fetch(`/api/homelog/shopping-list/${id}`, { method: 'DELETE' });
    await refresh();
  }

  if (inHousehold === false) {
    return (
      <div className="pb-24">
        <TopBar title="Inventory" />
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
      <TopBar title="Inventory" />
      <div className="px-4 py-4">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <Tabs defaultValue="inventory">
            <TabsList className="w-full">
              <TabsTrigger value="inventory" className="flex-1">Inventory</TabsTrigger>
              <TabsTrigger value="shopping" className="flex-1">Shopping List</TabsTrigger>
            </TabsList>

            <TabsContent value="inventory" className="mt-4 flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Add an item</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleAddItem} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Name</Label>
                      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Paper towels" />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label>Category</Label>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pantry">Pantry</SelectItem>
                            <SelectItem value="household">Household</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Quantity</Label>
                        <Input type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Low at</Label>
                        <Input type="number" min="0" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
                      </div>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add item'}</Button>
                  </form>
                </CardContent>
              </Card>

              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items yet. Add one above.</p>
              ) : (
                items.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {item.category} · {STATUS_LABEL[item.status]}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="icon" variant="outline" onClick={() => handleAdjust(item.id, -1)}>
                          <MinusIcon className="h-4 w-4" />
                        </Button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <Button type="button" size="icon" variant="outline" onClick={() => handleAdjust(item.id, 1)}>
                          <PlusIcon className="h-4 w-4" />
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => handleDeleteItem(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="shopping" className="mt-4 flex flex-col gap-4">
              <form onSubmit={handleAddShoppingItem} className="flex gap-2">
                <Input
                  value={shoppingLabel}
                  onChange={(e) => setShoppingLabel(e.target.value)}
                  placeholder="Add something to the list…"
                />
                <Button type="submit" size="icon" aria-label="Add to shopping list">
                  <PlusIcon className="h-4 w-4" />
                </Button>
              </form>

              {shoppingItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Shopping list is empty.</p>
              ) : (
                shoppingItems.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">Added by {item.addedByName}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" onClick={() => handleCheckOff(item.id)}>
                          Check off
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => handleRemoveShoppingItem(item.id)}>
                          Remove
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
      <HomeLogBottomNav />
    </div>
  );
}
