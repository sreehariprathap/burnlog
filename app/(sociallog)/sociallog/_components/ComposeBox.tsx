// app/(sociallog)/sociallog/_components/ComposeBox.tsx
'use client';

import { useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { useCurrentProfile } from '@/lib/useCurrentProfile';
import { apiFetch } from '@/lib/apiFetch';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 25 * 1024 * 1024;

export function ComposeBox({ onPosted }: { onPosted: () => void }) {
  const supabase = createClientComponentClient();
  const { profile } = useCurrentProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (selected: File) => {
    setError(null);
    const isImage = selected.type.startsWith('image/');
    const isVideo = selected.type.startsWith('video/');
    if (!isImage && !isVideo) {
      setError('Attach an image or video file');
      return;
    }
    if (isImage && selected.size > MAX_IMAGE_BYTES) {
      setError('Images must be under 10 MB');
      return;
    }
    if (isVideo && selected.size > MAX_VIDEO_BYTES) {
      setError('Videos must be under 25 MB');
      return;
    }
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
  };

  const clearFile = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handlePost = async () => {
    if (!text.trim() && !file) return;
    if (!profile) return;
    setPosting(true);
    setError(null);
    try {
      let mediaUrl: string | undefined;
      let mediaType: 'image' | 'video' | undefined;

      if (file) {
        mediaType = file.type.startsWith('video/') ? 'video' : 'image';
        const ext = file.name.split('.').pop() || (mediaType === 'video' ? 'mp4' : 'jpg');
        const path = `${profile.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('sociallog-media')
          .upload(path, file, { upsert: false, contentType: file.type });
        if (uploadError) throw uploadError;
        const { data: publicUrlData } = supabase.storage.from('sociallog-media').getPublicUrl(path);
        mediaUrl = publicUrlData.publicUrl;
      }

      const res = await apiFetch('/api/sociallog/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text.trim() || undefined, mediaType, mediaUrl }),
      });
      if (!res.ok) return; // apiFetch already toasted the failure

      setText('');
      clearFile();
      onPosted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-2 pt-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's happening? Use #topics to tag it."
          maxLength={500}
        />
        {previewUrl && file && (
          <div className="relative w-fit">
            {file.type.startsWith('video/') ? (
              <video src={previewUrl} className="max-h-40 rounded-lg" controls />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="" className="max-h-40 rounded-lg object-cover" />
            )}
            <button
              type="button"
              onClick={clearFile}
              aria-label="Remove attachment"
              className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={posting}>
            <ImageIcon className="size-4" />
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => {
              const selected = e.target.files?.[0];
              e.target.value = '';
              if (selected) handleFile(selected);
            }}
          />
          <Button onClick={handlePost} disabled={posting || (!text.trim() && !file)}>
            {posting ? <Loader2 className="size-4 animate-spin" /> : 'Post'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
