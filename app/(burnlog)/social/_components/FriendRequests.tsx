'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

type IncomingRequest = {
  id: string;
  requesterUsername: string;
  requesterFirstName: string;
  requesterLevel: number;
};

type FriendRequestsProps = {
  refreshKey: number;
  onChanged: () => void;
};

export function FriendRequests({ refreshKey, onChanged }: FriendRequestsProps) {
  const [requests, setRequests] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/social/requests');
        const data = await res.json();
        if (!cancelled) setRequests(data.incoming ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const respond = async (id: string, action: 'accept' | 'decline') => {
    setActingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/social/requests/${id}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || data.error) {
        const message = data.error ?? 'Failed to update request';
        setError(message);
        toast({ title: 'Request failed', description: message, variant: 'destructive' });
        return;
      }
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast({
        title: action === 'accept' ? 'Friend request accepted' : 'Friend request declined',
      });
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
      toast({ title: 'Request failed', description: message, variant: 'destructive' });
    } finally {
      setActingId(null);
    }
  };

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Friend Requests</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {requests.map((r) => (
          <div key={r.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{r.requesterFirstName}</p>
              <p className="text-xs text-muted-foreground">@{r.requesterUsername} · Level {r.requesterLevel}</p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                aria-label={`Accept friend request from ${r.requesterFirstName}`}
                disabled={actingId === r.id}
                onClick={() => respond(r.id, 'accept')}
              >
                {actingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={`Decline friend request from ${r.requesterFirstName}`}
                disabled={actingId === r.id}
                onClick={() => respond(r.id, 'decline')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
