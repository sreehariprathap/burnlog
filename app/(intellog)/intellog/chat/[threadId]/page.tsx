// app/(intellog)/intellog/chat/[threadId]/page.tsx
'use client';

import { useParams } from 'next/navigation';
import { TopBar } from '@/components/TopBar';
import { ChatThreadView } from '@/components/intellog/ChatThreadView';

export default function IntelLogChatThreadPage() {
  const params = useParams<{ threadId: string }>();

  return (
    <div className="flex h-dvh flex-col pb-20">
      <TopBar title="Chat" />
      <ChatThreadView threadId={params.threadId} />
    </div>
  );
}
