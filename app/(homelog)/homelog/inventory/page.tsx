// app/(homelog)/homelog/inventory/page.tsx
'use client';
// Client Component — page metadata isn't applicable here (see layout.tsx for shared app metadata).

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { MinusIcon, PlusIcon, Package, ShoppingCart, RefreshCw } from 'lucide-react';
import { TopBar } from '@/components/TopBar';
import { HomeLogBottomNav } from '@/components/HomeLogBottomNav';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useHouseholdMe } from '@/lib/homelog/useHouseholdMe';
import { useToast } from '@/components/ui/use-toast';
import { inventoryQuery, shoppingListQuery, type InventoryItem } from '@/lib/homelog/queries';

const STATUS_LABEL: Record<InventoryItem['status'], string> = {
  in_stock: 'In stock',
  low: 'Low',
  out: 'Out',
};

export default function InventoryPage() {
  const { toast } = useToast();
  const { household, isLoading: householdLoading } = useHouseholdMe();
  const hasHousehold = !householdLoading && !!household;

  const {
    data: items,
    isLoading: itemsLoading,
    mutate: refreshItems,
  } = useSWR(
    hasHousehold ? inventoryQuery().key : null,
    hasHousehold ? inventoryQuery().fetcher : null
  );
  const {
    data: shoppingItems,
    isLoading: shoppingLoading,
    mutate: refreshShopping,
  } = useSWR(
    hasHousehold ? shoppingListQuery().key : null,
    hasHousehold ? shoppingListQuery().fetcher : null
  );

  const loading = householdLoading || itemsLoading || shoppingLoading;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('pantry');
  const [quantity, setQuantity] = useState('1');
  const [threshold, setThreshold] = useState('1');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  const [shoppingLabel, setShoppingLabel] = useState('');
  const [addingShopping, setAddingShopping] = useState(false);
  const [checkingOffId, setCheckingOffId] = useState<string | null>(null);
  const [removingShoppingId, setRemovingShoppingId] = useState<string | null>(null);

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
      await refreshItems();
      await refreshShopping();
      toast({ title: 'Item added' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add item';
      setError(message);
      toast({ title: 'Failed to add item', description: message, variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  }

  async function handleAdjust(id: string, delta: number) {
    setAdjustingId(id);
    try {
      const res = await fetch(`/api/homelog/inventory/${id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) throw new Error('Failed to update quantity');
      await refreshItems();
      await refreshShopping();
    } catch (err) {
      toast({
        title: 'Failed to update quantity',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setAdjustingId(null);
    }
  }

  async function handleDeleteItem(id: string) {
    if (!window.confirm('Delete this item from your inventory?')) return;
    setDeletingItemId(id);
    try {
      const res = await fetch(`/api/homelog/inventory/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      await refreshItems();
      toast({ title: 'Item deleted' });
    } catch (err) {
      toast({
        title: 'Failed to delete item',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setDeletingItemId(null);
    }
  }

  async function handleAddShoppingItem(e: React.FormEvent) {
    e.preventDefault();
    if (!shoppingLabel.trim()) {
      setError('Please enter an item to add');
      return;
    }
    setError('');
    setAddingShopping(true);
    try {
      const res = await fetch('/api/homelog/shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: shoppingLabel.trim() }),
      });
      if (!res.ok) throw new Error('Failed to add to shopping list');
      setShoppingLabel('');
      await refreshShopping();
      toast({ title: 'Added to shopping list' });
    } catch (err) {
      toast({
        title: 'Failed to add item',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setAddingShopping(false);
    }
  }

  async function handleCheckOff(id: string) {
    setCheckingOffId(id);
    try {
      const res = await fetch(`/api/homelog/shopping-list/${id}/check`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to check off item');
      await refreshShopping();
      await refreshItems();
      toast({ title: 'Checked off' });
    } catch (err) {
      toast({
        title: 'Failed to check off item',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setCheckingOffId(null);
    }
  }

  async function handleRemoveShoppingItem(id: string) {
    if (!window.confirm('Remove this item from the shopping list?')) return;
    setRemovingShoppingId(id);
    try {
      const res = await fetch(`/api/homelog/shopping-list/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove item');
      await refreshShopping();
      toast({ title: 'Item removed' });
    } catch (err) {
      toast({
        title: 'Failed to remove item',
        description: err instanceof Error ? err.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setRemovingShoppingId(null);
    }
  }

  if (!householdLoading && !household) {
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
      <TopBar
        title="Inventory"
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Refresh"
            onClick={() => {
              refreshItems();
              refreshShopping();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        }
      />
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
                      <Label htmlFor="item-name">Name</Label>
                      <Input
                        id="item-name"
                        autoFocus
                        autoComplete="off"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Paper towels"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="item-category">Category</Label>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger id="item-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pantry">Pantry</SelectItem>
                            <SelectItem value="household">Household</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="item-quantity">Quantity</Label>
                        <Input
                          id="item-quantity"
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="item-threshold">Low at</Label>
                        <Input
                          id="item-threshold"
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={threshold}
                          onChange={(e) => setThreshold(e.target.value)}
                        />
                      </div>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add item'}</Button>
                  </form>
                </CardContent>
              </Card>

              {!items || items.length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center">
                  <Package className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm font-semibold">No items yet</p>
                  <p className="text-xs text-muted-foreground">Add an item above to start tracking your inventory.</p>
                </div>
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
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() => handleAdjust(item.id, -1)}
                          disabled={adjustingId === item.id}
                        >
                          <MinusIcon className="h-4 w-4" />
                        </Button>
                        <span className="w-6 text-center text-sm">{item.quantity}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          aria-label={`Increase ${item.name} quantity`}
                          onClick={() => handleAdjust(item.id, 1)}
                          disabled={adjustingId === item.id}
                        >
                          <PlusIcon className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteItem(item.id)}
                          disabled={deletingItemId === item.id}
                        >
                          {deletingItemId === item.id ? 'Deleting…' : 'Delete'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="shopping" className="mt-4 flex flex-col gap-4">
              <form onSubmit={handleAddShoppingItem} className="flex gap-2">
                <Label htmlFor="shopping-label" className="sr-only">
                  Add something to the shopping list
                </Label>
                <Input
                  id="shopping-label"
                  autoComplete="off"
                  value={shoppingLabel}
                  onChange={(e) => setShoppingLabel(e.target.value)}
                  placeholder="Add something to the list…"
                />
                <Button type="submit" size="icon" aria-label="Add to shopping list" disabled={addingShopping}>
                  <PlusIcon className="h-4 w-4" />
                </Button>
              </form>
              {error && <p className="text-sm text-destructive">{error}</p>}

              {!shoppingItems || shoppingItems.length === 0 ? (
                <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed p-6 text-center">
                  <ShoppingCart className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm font-semibold">Shopping list is empty</p>
                  <p className="text-xs text-muted-foreground">Add something above when you&apos;re running low.</p>
                </div>
              ) : (
                shoppingItems.map((item) => (
                  <Card key={item.id}>
                    <CardContent className="flex items-center justify-between gap-3 p-4">
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">Added by {item.addedByName}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleCheckOff(item.id)}
                          disabled={checkingOffId === item.id}
                        >
                          {checkingOffId === item.id ? 'Saving…' : 'Check off'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveShoppingItem(item.id)}
                          disabled={removingShoppingId === item.id}
                        >
                          {removingShoppingId === item.id ? 'Removing…' : 'Remove'}
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
