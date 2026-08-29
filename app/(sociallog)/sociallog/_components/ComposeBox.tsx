// app/(sociallog)/sociallog/_components/ComposeBox.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

export function ComposeBox({ onPosted }: { onPosted: () => void }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);

  const handlePost = async () => {
    if (!text.trim()) return;
    setPosting(true);
    const res = await fetch('/api/sociallog/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text.trim() }),
    });
    if (res.ok) {
      setText('');
      onPosted();
    }
    setPosting(false);
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
        <div className="flex justify-end">
          <Button onClick={handlePost} disabled={posting || !text.trim()}>
            {posting ? 'Posting…' : 'Post'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
