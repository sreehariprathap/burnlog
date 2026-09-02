// app/(travellog)/travellog/plan/_components/ItineraryReview.tsx
'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { ItineraryRequest, Itinerary } from '@/lib/travellog/itinerary';

const CONVERT_TARGETS = ['USD', 'EUR', 'GBP', 'JPY', 'INR', 'AUD', 'CAD', 'THB'];

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

type ItineraryReviewProps = {
  req: ItineraryRequest;
  itinerary: Itinerary;
  onAccept?: () => void;
  onStartOver?: () => void;
  accepting?: boolean;
};

export function ItineraryReview({ req, itinerary, onAccept, onStartOver, accepting = false }: ItineraryReviewProps) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [convertTo, setConvertTo] = useState(itinerary.currency);
  const [convertedTotal, setConvertedTotal] = useState<number | null>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (convertTo === itinerary.currency) {
      setConvertedTotal(null);
      return;
    }
    let cancelled = false;
    setConverting(true);
    fetch(`/api/ai/travellog/currency?from=${itinerary.currency}&to=${convertTo}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && typeof data.rate === 'number') {
          setConvertedTotal(itinerary.totalEstimatedCost * data.rate);
        }
      })
      .finally(() => {
        if (!cancelled) setConverting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [convertTo, itinerary.currency, itinerary.totalEstimatedCost]);

  const currentDay = itinerary.days[selectedDay];
  const budgetItems: Array<{ label: string; amount: number }> = [
    { label: 'Accommodation', amount: itinerary.budgetBreakdown.accommodation },
    { label: 'Food', amount: itinerary.budgetBreakdown.food },
    { label: 'Activities', amount: itinerary.budgetBreakdown.activities },
    { label: 'Transport', amount: itinerary.budgetBreakdown.transport },
  ];

  const isOverBudget = req.budget != null && itinerary.totalEstimatedCost > req.budget;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {itinerary.days.map((day, i) => (
          <Button key={day.day} type="button" variant={i === selectedDay ? 'default' : 'outline'} size="sm" onClick={() => setSelectedDay(i)}>
            Day {day.day}
          </Button>
        ))}
      </div>

      {currentDay && (
        <div className="flex flex-col gap-3">
          {currentDay.activities.map((activity, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                    <p className="font-medium">{activity.title}</p>
                  </div>
                  <p className="text-sm font-semibold text-primary whitespace-nowrap">
                    {formatCurrency(activity.estimatedCost, itinerary.currency)}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{activity.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{activity.location}</p>
                {activity.transportNote && <p className="text-xs text-muted-foreground italic mt-1">{activity.transportNote}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Budget overview</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-2">
          {budgetItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium">{formatCurrency(item.amount, itinerary.currency)}</span>
            </div>
          ))}
          <div className="border-t pt-2 mt-1 flex items-center justify-between">
            <span className="font-semibold">Total estimated</span>
            <span className={`font-semibold ${isOverBudget ? 'text-red-500' : ''}`}>
              {formatCurrency(itinerary.totalEstimatedCost, itinerary.currency)}
            </span>
          </div>
          {req.budget != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Your budget</span>
              <span>{formatCurrency(req.budget, req.budgetCurrency)}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-sm text-muted-foreground">Convert to</span>
            <Select value={convertTo} onValueChange={setConvertTo}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONVERT_TARGETS.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {converting && <Loader2 className="animate-spin w-4 h-4" />}
            {!converting && convertedTotal != null && (
              <span className="text-sm font-medium">{formatCurrency(convertedTotal, convertTo)}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {(onAccept || onStartOver) && (
        <div className="flex gap-2">
          {onStartOver && (
            <Button type="button" variant="outline" onClick={onStartOver} disabled={accepting}>
              Start over
            </Button>
          )}
          {onAccept && (
            <Button type="button" className="flex-1" onClick={onAccept} disabled={accepting}>
              {accepting ? <Loader2 className="animate-spin w-5 h-5" /> : 'Accept trip plan'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
