// app/(travellog)/travellog/map/_components/LogVisitDrawer.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useToast } from '@/components/ui/use-toast';
import { geocodePlace } from '@/lib/travellog/geocode';

type LogVisitDrawerProps = {
  profileId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function LogVisitDrawer({ profileId, open, onOpenChange, onSaved }: LogVisitDrawerProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [placeName, setPlaceName] = useState('');
  const [country, setCountry] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [departureDate, setDepartureDate] = useState('');
  const [notes, setNotes] = useState('');
  const [looking, setLooking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [coordError, setCoordError] = useState<string | null>(null);
  const [tripPlanId, setTripPlanId] = useState<string>('none');
  const [travelMode, setTravelMode] = useState<'flight' | 'road_trip'>('flight');
  const [trips, setTrips] = useState<{ id: string; destination: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/travellog/plans')
      .then((res) => (res.ok ? res.json() : { plans: [] }))
      .then((body) => {
        setTrips((body.plans ?? []).map((p: { id: string; destination: string }) => ({ id: p.id, destination: p.destination })));
      });
  }, [open]);

  function reset() {
    setPlaceName('');
    setCountry('');
    setLat('');
    setLng('');
    setArrivalDate(new Date().toISOString().slice(0, 10));
    setDepartureDate('');
    setNotes('');
    setPlaceError(null);
    setCoordError(null);
    setTripPlanId('none');
    setTravelMode('flight');
  }

  async function handleLookup() {
    if (!placeName.trim()) return;
    setLooking(true);
    try {
      const result = await geocodePlace(country.trim() ? `${placeName}, ${country}` : placeName);
      if (result) {
        setLat(String(result.lat));
        setLng(String(result.lng));
        setCoordError(null);
      } else {
        setCoordError('No match found — enter latitude/longitude manually');
      }
    } finally {
      setLooking(false);
    }
  }

  async function handleSave() {
    setPlaceError(null);
    setCoordError(null);

    if (!placeName.trim()) {
      setPlaceError('Place name is required');
      return;
    }
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    if (!lat || !lng || Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) {
      setCoordError('Look up the place or enter latitude/longitude manually');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('travellog_visits').insert({
        profileId,
        tripPlanId: tripPlanId === 'none' ? null : tripPlanId,
        placeName: placeName.trim(),
        country: country.trim() || 'Unknown',
        lat: parsedLat,
        lng: parsedLng,
        arrivalDate,
        departureDate: departureDate || null,
        notes: notes.trim() || null,
        travelMode,
      });
      if (error) throw error;
      toast({ description: `Logged ${placeName.trim()}.` });
      reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast({ title: 'Could not save visit', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Log a visit</DrawerTitle>
        </DrawerHeader>
        <div className="p-4 space-y-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="placeName">Place</Label>
            <div className="flex gap-2">
              <Input id="placeName" value={placeName} onChange={(e) => setPlaceName(e.target.value)} placeholder="e.g. Kyoto" />
              <Button type="button" variant="outline" onClick={handleLookup} disabled={looking || !placeName.trim()}>
                {looking ? 'Looking…' : 'Look up'}
              </Button>
            </div>
            {placeError && <p role="alert" aria-live="polite" className="text-destructive text-xs">{placeError}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="country">Country</Label>
            <Input id="country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Japan" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="lat">Latitude</Label>
              <Input id="lat" type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lng">Longitude</Label>
              <Input id="lng" type="number" step="any" value={lng} onChange={(e) => setLng(e.target.value)} />
            </div>
          </div>
          {coordError && <p role="alert" aria-live="polite" className="text-destructive text-xs">{coordError}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="arrivalDate">Arrival</Label>
              <Input id="arrivalDate" type="date" value={arrivalDate} onChange={(e) => setArrivalDate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="departureDate">Departure (optional)</Label>
              <Input id="departureDate" type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="travelMode">How did you get there?</Label>
            <Select value={travelMode} onValueChange={(v) => setTravelMode(v as 'flight' | 'road_trip')}>
              <SelectTrigger id="travelMode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="flight">Flight</SelectItem>
                <SelectItem value="road_trip">Road trip</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {trips.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="tripPlan">Part of a trip? (optional)</Label>
              <Select value={tripPlanId} onValueChange={setTripPlanId}>
                <SelectTrigger id="tripPlan"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not part of a trip</SelectItem>
                  {trips.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.destination}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save visit'}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
