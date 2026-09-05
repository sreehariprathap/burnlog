// app/(sociallog)/sociallog/_components/CommentList.tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/apiFetch';
import { formatRelative } from '@/lib/format';

type Comment = {
  id: string;
  body: string;
  createdAt: string;
  author: { id: string; username: string; firstName: string; avatarUrl: string | null };
};

async function fetcher(url: string) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Failed to load comments');
  return res.json();
}

export function CommentList({ postId }: { postId: string }) {
  const { data, mutate, isLoading } = useSWR<{ comments: Comment[] }>(
    `/api/sociallog/posts/${postId}/comments`,
    fetcher
  );
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const handlePost = async () => {
    if (!text.trim()) {
      setError('Write something before replying');
      return;
    }
    setError(null);
    setPosting(true);
    const res = await apiFetch(`/api/sociallog/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text.trim() }),
    });
    if (res.ok) {
      const created: Comment = await res.json();
      mutate((prev) => ({ comments: [...(prev?.comments ?? []), created] }), { revalidate: false });
      setText('');
    }
    setPosting(false);
  };

  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      {isLoading && (
        <div role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="sr-only">Loading…</span>
        </div>
      )}
      {(data?.comments ?? []).map((c) => (
        <div key={c.id} className="flex gap-2">
          <Avatar className="size-7">
            {c.author.avatarUrl && <AvatarImage src={c.author.avatarUrl} alt={c.author.username} />}
            <AvatarFallback className="text-[10px]">{c.author.firstName?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 rounded-lg bg-muted px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">@{c.author.username}</span>
              <span className="text-[10px] text-muted-foreground">
                {formatRelative(c.createdAt)}
              </span>
            </div>
            <p className="text-sm">{c.body}</p>
          </div>
        </div>
      ))}
      <div className="space-y-1">
        <div className="flex gap-2">
          <Label htmlFor={`comment-${postId}`} className="sr-only">
            Write a comment
          </Label>
          <Input
            id={`comment-${postId}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a comment…"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) handlePost();
            }}
          />
          <Button size="sm" onClick={handlePost} disabled={posting || !text.trim()}>
            {posting ? <Loader2 className="size-4 animate-spin" /> : 'Reply'}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
