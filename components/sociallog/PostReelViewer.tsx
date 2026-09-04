// components/sociallog/PostReelViewer.tsx
'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Reel,
  ReelContent,
  ReelControls,
  ReelFooter,
  ReelHeader,
  ReelImage,
  ReelMuteButton,
  ReelNavigation,
  ReelPlayButton,
  ReelProgress,
  ReelVideo,
  type ReelItem,
} from '@/components/kibo-ui/reel';
import type { FeedPost } from '@/app/(sociallog)/sociallog/_components/PostCard';

const IMAGE_DURATION_SECONDS = 6;
const VIDEO_DURATION_SECONDS = 30; // upper bound — ReelVideo advances on the video's own playback, this just caps auto-advance if metadata is odd

interface PostReelViewerProps {
  posts: FeedPost[];
  initialIndex: number;
  onClose: () => void;
}

/** Full-screen Instagram-Stories-style viewer for existing SocialLog posts
 * that have an image/video attached — reuses the posts as-is, this is just
 * a different way to browse them (see kibo-ui's Reel,
 * https://www.kibo-ui.com/components/reel). */
export function PostReelViewer({ posts, initialIndex, onClose }: PostReelViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const mediaPosts = posts.filter((p) => p.mediaUrl && (p.mediaType === 'image' || p.mediaType === 'video'));
  const items: ReelItem[] = mediaPosts.map((p) => ({
    id: p.id,
    type: p.mediaType === 'video' ? 'video' : 'image',
    src: p.mediaUrl as string,
    duration: p.mediaType === 'video' ? VIDEO_DURATION_SECONDS : IMAGE_DURATION_SECONDS,
  }));

  if (items.length === 0) return null;
  const currentPost = mediaPosts[index];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/90 p-4">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-[120] rounded-full bg-black/40 p-2 text-white"
      >
        <X className="size-5" />
      </button>
      <Reel
        data={items}
        index={index}
        onIndexChange={setIndex}
        className="h-full max-h-[90vh] w-auto rounded-2xl"
      >
        <ReelProgress />
        <ReelHeader>
          <div className="flex items-center gap-2 text-white">
            <Avatar className="size-8 border border-white/30">
              <AvatarImage src={currentPost.author.avatarUrl ?? undefined} />
              <AvatarFallback>{currentPost.author.firstName[0]}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">@{currentPost.author.username}</span>
          </div>
        </ReelHeader>
        <ReelContent>
          {(item) =>
            item.type === 'video' ? (
              <ReelVideo src={item.src} />
            ) : (
              <ReelImage src={item.src} alt="" />
            )
          }
        </ReelContent>
        <ReelNavigation />
        {currentPost.body && (
          <ReelFooter>
            <p className="text-sm text-white">{currentPost.body}</p>
          </ReelFooter>
        )}
        <ReelControls>
          <ReelPlayButton />
          <ReelMuteButton />
        </ReelControls>
      </Reel>
    </div>
  );
}
