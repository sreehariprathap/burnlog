// app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import type { ItineraryRequest, Itinerary, TransportMode } from '@/lib/travellog/itinerary';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'THB'];

type TripIntakeFormProps = {
  onGenerated: (req: ItineraryRequest, itinerary: Itinerary) => void;
  initial?: Partial<ItineraryRequest>;
};

export function TripIntakeForm({ onGenerated, initial }: TripIntakeFormProps) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);

  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [hotel, setHotel] = useState(initial?.hotel ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [numPeople, setNumPeople] = useState(String(initial?.numPeople ?? 1));
  const [transportMode, setTransportMode] = useState<TransportMode>(initial?.transportMode ?? 'public_transit');
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : '');
  const [budgetCurrency, setBudgetCurrency] = useState(initial?.budgetCurrency ?? 'USD');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!destination.trim() || !startDate || !endDate) {
      setError('Destination, start date, and end date are required.');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after the start date.');
      return;
    }

    const req: ItineraryRequest = {
      destination: destination.trim(),
      hotel: hotel.trim(),
      startDate,
      endDate,
      numPeople: Number(numPeople) || 1,
      transportMode,
      budget: budget.trim() ? Number(budget) : null,
      budgetCurrency,
    };

    setLoading(true);
    try {
      const res = await fetch('/api/ai/travellog/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate itinerary');
      onGenerated(req, data as Itinerary);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      setError(message);
      toast({ title: 'Could not generate itinerary', description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="destination">Destination</Label>
            <Input id="destination" placeholder="e.g. Kyoto, Japan" value={destination} onChange={(e) => setDestination(e.target.value)} disabled={loading} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="hotel">Hotel / area (optional)</Label>
            <Input id="hotel" placeholder="Hotel name or neighbourhood" value={hotel} onChange={(e) => setHotel(e.target.value)} disabled={loading} />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input id="startDate" type="date" min={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={loading} required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" min={startDate || today} value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={loading} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="numPeople">Number of people</Label>
              <Input id="numPeople" type="number" min={1} value={numPeople} onChange={(e) => setNumPeople(e.target.value)} disabled={loading} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="transportMode">Transport mode</Label>
              <Select value={transportMode} onValueChange={(v) => setTransportMode(v as TransportMode)} disabled={loading}>
                <SelectTrigger id="transportMode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="car">Car</SelectItem>
                  <SelectItem value="public_transit">Public transit</SelectItem>
                  <SelectItem value="flight">Flight</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="budget">Budget (optional)</Label>
              <Input id="budget" type="number" min={0} step="0.01" placeholder="0.00" value={budget} onChange={(e) => setBudget(e.target.value)} disabled={loading} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="budgetCurrency">Currency</Label>
              <Select value={budgetCurrency} onValueChange={setBudgetCurrency} disabled={loading}>
                <SelectTrigger id="budgetCurrency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Generate itinerary'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
