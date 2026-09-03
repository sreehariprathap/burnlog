// app/(intellog)/intellog/chat/new/page.tsx
'use client';

import { TopBar } from '@/components/TopBar';
import { ChatThreadView } from '@/components/intellog/ChatThreadView';

export default function IntelLogNewChatPage() {
  return (
    <div className="flex h-dvh flex-col pb-20">
      <TopBar title="New chat" />
      <ChatThreadView threadId={null} />
    </div>
  );
}
