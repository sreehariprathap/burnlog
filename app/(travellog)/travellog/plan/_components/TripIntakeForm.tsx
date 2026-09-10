// app/(travellog)/travellog/plan/_components/TripIntakeForm.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { isCurrencyCode } from '@/lib/currency';
import type { ItineraryRequest, Itinerary, TransportMode } from '@/lib/travellog/itinerary';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'THB'];

type TripIntakeFormProps = {
  onGenerated: (req: ItineraryRequest, itinerary: Itinerary) => void;
  initial?: Partial<ItineraryRequest>;
};

export function TripIntakeForm({ onGenerated, initial }: TripIntakeFormProps) {
  const { toast } = useToast();
  const { profile } = useCurrentProfile();
  const today = new Date().toISOString().slice(0, 10);

  const [origin, setOrigin] = useState(initial?.origin ?? '');
  const [originTouched, setOriginTouched] = useState(false);
  const [destination, setDestination] = useState(initial?.destination ?? '');
  const [hotel, setHotel] = useState(initial?.hotel ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [departureTime, setDepartureTime] = useState(initial?.departureTime ?? '09:00');
  const [returnTime, setReturnTime] = useState(initial?.returnTime ?? '18:00');
  const [numPeople, setNumPeople] = useState(String(initial?.numPeople ?? 1));
  const [transportMode, setTransportMode] = useState<TransportMode>(initial?.transportMode ?? 'public_transit');
  const [budget, setBudget] = useState(initial?.budget != null ? String(initial.budget) : '');
  const [budgetCurrency, setBudgetCurrency] = useState(initial?.budgetCurrency ?? '');
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [accommodationBooked, setAccommodationBooked] = useState(initial?.accommodationBooked ?? false);
  const [accommodationNights, setAccommodationNights] = useState(
    initial?.accommodationNights != null ? String(initial.accommodationNights) : ''
  );
  const [accommodationPaid, setAccommodationPaid] = useState(
    initial?.accommodationPaid != null ? String(initial.accommodationPaid) : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill origin and currency from the profile once it loads — but only if
  // the user hasn't already typed something (initial from a suggestion link
  // wins, and so does anything they've started editing).
  useEffect(() => {
    if (!profile || originTouched || origin) return;
    const city = profile.city as string | undefined;
    const country = profile.country as string | undefined;
    if (city || country) {
      setOrigin([city, country].filter(Boolean).join(', '));
    }
  }, [profile, origin, originTouched]);

  useEffect(() => {
    if (!profile || currencyTouched || budgetCurrency) return;
    const currency = profile.currency as string | undefined;
    if (currency && isCurrencyCode(currency) && CURRENCIES.includes(currency)) {
      setBudgetCurrency(currency);
    } else {
      setBudgetCurrency('USD');
    }
  }, [profile, budgetCurrency, currencyTouched]);

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
    if (accommodationBooked && (!accommodationNights.trim() || !accommodationPaid.trim())) {
      setError('Enter the number of nights and amount paid for your booked stay.');
      return;
    }

    const req: ItineraryRequest = {
      origin: origin.trim(),
      destination: destination.trim(),
      hotel: hotel.trim(),
      startDate,
      endDate,
      departureTime,
      returnTime,
      numPeople: Number(numPeople) || 1,
      transportMode,
      budget: budget.trim() ? Number(budget) : null,
      budgetCurrency: budgetCurrency || 'USD',
      accommodationBooked,
      accommodationNights: accommodationBooked ? Number(accommodationNights) || null : null,
      accommodationPaid: accommodationBooked ? Number(accommodationPaid) || null : null,
      flightCostOverride: null,
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
            <Label htmlFor="origin">Going from</Label>
            <Input
              id="origin"
              placeholder="e.g. Vancouver, Canada"
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                setOriginTouched(true);
              }}
              disabled={loading}
            />
          </div>
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
              <Label htmlFor="departureTime">Time of leaving</Label>
              <Input id="departureTime" type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} disabled={loading} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="returnTime">Expected return time</Label>
              <Input id="returnTime" type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} disabled={loading} />
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
              <Select
                value={budgetCurrency || 'USD'}
                onValueChange={(v) => {
                  setBudgetCurrency(v);
                  setCurrencyTouched(true);
                }}
                disabled={loading}
              >
                <SelectTrigger id="budgetCurrency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-3">
            <Label>Already booked your stay?</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                size="sm"
                variant={accommodationBooked ? 'default' : 'outline'}
                onClick={() => setAccommodationBooked(true)}
                disabled={loading}
              >
                Yes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!accommodationBooked ? 'default' : 'outline'}
                onClick={() => setAccommodationBooked(false)}
                disabled={loading}
              >
                Not yet
              </Button>
            </div>
            {accommodationBooked ? (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="accommodationNights">Nights</Label>
                  <Input
                    id="accommodationNights"
                    type="number"
                    min={1}
                    value={accommodationNights}
                    onChange={(e) => setAccommodationNights(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="accommodationPaid">Amount paid</Label>
                  <Input
                    id="accommodationPaid"
                    type="number"
                    min={0}
                    step="0.01"
                    value={accommodationPaid}
                    onChange={(e) => setAccommodationPaid(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground pt-1">
                We&apos;ll suggest a few places to stay along with the itinerary.
              </p>
            )}
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
