'use client';

import { useRef, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Camera, Loader2 } from 'lucide-react';

const AVATAR_COLORS = ['#F97316', '#FBBF24', '#EF4444', '#FF9E4F', '#B55233'];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initialsFor(firstName: string, lastName: string): string {
  return `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`.toUpperCase();
}

type ProfileAvatarProps = {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  onUploaded: (url: string) => void;
};

export function ProfileAvatar({ userId, firstName, lastName, avatarUrl, onUploaded }: ProfileAvatarProps) {
  const supabase = createClientComponentClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB');
      return;
    }

    setUploading(true);
    try {
      const path = `${userId}/avatar`;

      const { data: existing } = await supabase.storage.from('avatars').list(userId);
      const stale = (existing ?? []).filter((obj) => obj.name !== 'avatar').map((obj) => `${userId}/${obj.name}`);
      if (stale.length > 0) {
        await supabase.storage.from('avatars').remove(stale);
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatarUrl: publicUrl })
        .eq('userId', userId);

      if (updateError) throw updateError;

      onUploaded(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="relative"
        aria-label="Change profile photo"
      >
        <Avatar className="size-24 border-2 border-primary/20">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={`${firstName} ${lastName}`} />}
          <AvatarFallback
            className="text-2xl font-semibold text-white"
            style={{ backgroundColor: colorForName(`${firstName}${lastName}`) }}
          >
            {initialsFor(firstName, lastName)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute bottom-0 right-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) handleFile(file);
        }}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
