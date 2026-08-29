// app/(sociallog)/sociallog/_components/PostCard.tsx
'use client';

import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowBigUp, ArrowBigDown, MessageCircle, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommentList } from './CommentList';
import { apiFetch } from '@/lib/sociallog/apiFetch';

export type FeedPost = {
  id: string;
  kind: string;
  body: string | null;
  mediaType: string | null;
  mediaUrl: string | null;
  sourceApp: string | null;
  sourceRefType: string | null;
  createdAt: string;
  author: { id: string; username: string; firstName: string; avatarUrl: string | null };
  score: number;
  myVote: 1 | -1 | null;
  commentCount: number;
  topics: string[];
  isFollowingAuthor: boolean;
};

const SOURCE_LABELS: Record<string, string> = {
  burnlog: 'BurnLog',
  tasklog: 'TaskLog',
  homelog: 'HomeLog',
  moneylog: 'MoneyLog',
};

export function PostCard({ post, currentProfileId }: { post: FeedPost; currentProfileId: string | null }) {
  const [score, setScore] = useState(post.score);
  const [myVote, setMyVote] = useState<1 | -1 | null>(post.myVote);
  const [following, setFollowing] = useState(post.isFollowingAuthor);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const vote = async (value: 1 | -1) => {
    const prevScore = score;
    const prevVote = myVote;
    const nextVote = prevVote === value ? null : value;
    setScore(prevScore - (prevVote ?? 0) + (nextVote ?? 0));
    setMyVote(nextVote);

    const res = await apiFetch(`/api/sociallog/posts/${post.id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) {
      setScore(prevScore);
      setMyVote(prevVote);
    }
  };

  const toggleFollow = async () => {
    setFollowBusy(true);
    if (following) {
      const res = await apiFetch(`/api/sociallog/follow/${post.author.id}`, { method: 'DELETE' });
      if (res.ok) setFollowing(false);
    } else {
      const res = await apiFetch('/api/sociallog/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followingId: post.author.id }),
      });
      if (res.ok) setFollowing(true);
    }
    setFollowBusy(false);
  };

  const isOwnPost = currentProfileId === post.author.id;
  const isActivity = post.kind === 'CROSS_APP_ACTIVITY';

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar className="size-9">
              {post.author.avatarUrl && <AvatarImage src={post.author.avatarUrl} alt={post.author.username} />}
              <AvatarFallback>{post.author.firstName?.[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold">@{post.author.username}</span>
                {isActivity && post.sourceApp && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-3" />
                    via {SOURCE_LABELS[post.sourceApp] ?? post.sourceApp}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNowStrict(new Date(post.createdAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          {!isOwnPost && (
            <Button variant={following ? 'outline' : 'default'} size="sm" onClick={toggleFollow} disabled={followBusy}>
              {following ? 'Following' : 'Follow'}
            </Button>
          )}
        </div>

        {post.body && <p className="mt-3 whitespace-pre-wrap text-sm">{post.body}</p>}

        {post.mediaUrl && post.mediaType === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.mediaUrl} alt="" className="mt-3 max-h-96 w-full rounded-lg object-cover" />
        )}
        {post.mediaUrl && post.mediaType === 'video' && (
          <video src={post.mediaUrl} controls className="mt-3 max-h-96 w-full rounded-lg" />
        )}

        {post.topics.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.topics.map((t) => (
              <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                #{t}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => vote(1)}
              aria-label="Upvote"
              className={cn('rounded-full p-1', myVote === 1 ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              <ArrowBigUp className="size-5" fill={myVote === 1 ? 'currentColor' : 'none'} />
            </button>
            <span className="min-w-6 text-center text-sm font-medium">{score}</span>
            <button
              type="button"
              onClick={() => vote(-1)}
              aria-label="Downvote"
              className={cn('rounded-full p-1', myVote === -1 ? 'text-primary' : 'text-muted-foreground hover:text-foreground')}
            >
              <ArrowBigDown className="size-5" fill={myVote === -1 ? 'currentColor' : 'none'} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCommentsOpen((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <MessageCircle className="size-4" />
            {post.commentCount}
          </button>
        </div>

        {commentsOpen && <CommentList postId={post.id} />}
      </CardContent>
    </Card>
  );
}
