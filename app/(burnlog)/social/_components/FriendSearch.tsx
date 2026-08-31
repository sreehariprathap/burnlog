'use client';

import { useState } from 'react';
import { Loader2, UserPlus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';

type SearchResult = { id: string; username: string; firstName: string; level: number };

type FriendSearchProps = {
  onRequestSent: () => void;
};

export function FriendSearch({ onRequestSent }: FriendSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingUsername, setSendingUsername] = useState<string | null>(null);
  const [sentUsernames, setSentUsernames] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSearch = async (q: string) => {
    setQuery(q);
    setError(null);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/social/search?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? 'Search failed');
        return;
      }
      setResults(data.results ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (username: string) => {
    setSendingUsername(username);
    setError(null);
    try {
      const res = await fetch('/api/social/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresseeUsername: username }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const message = data.error ?? 'Failed to send request';
        setError(message);
        toast({ title: 'Could not send request', description: message, variant: 'destructive' });
        return;
      }
      setSentUsernames((prev) => new Set(prev).add(username));
      toast({ title: 'Friend request sent', description: `Request sent to @${username}` });
      onRequestSent();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      setError(message);
      toast({ title: 'Could not send request', description: message, variant: 'destructive' });
    } finally {
      setSendingUsername(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find Friends</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="friend-search-input" className="sr-only">
          Search by username
        </Label>
        <Input
          id="friend-search-input"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search by username"
          autoComplete="off"
        />
        {searching && <Loader2 className="h-4 w-4 animate-spin" />}
        {error && <p className="text-sm text-red-500">{error}</p>}
        {results.map((r) => (
          <div key={r.id} className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{r.firstName}</p>
              <p className="text-xs text-muted-foreground">@{r.username} · Level {r.level}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={sendingUsername === r.username || sentUsernames.has(r.username)}
              onClick={() => handleSendRequest(r.username)}
            >
              {sendingUsername === r.username ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : sentUsernames.has(r.username) ? (
                'Sent'
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-1" /> Add
                </>
              )}
            </Button>
          </div>
        ))}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No matches</p>
        )}
      </CardContent>
    </Card>
  );
}
