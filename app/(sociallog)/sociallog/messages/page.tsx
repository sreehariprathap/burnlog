import { redirect } from 'next/navigation';

// /sociallog/messages (the thread list) is now a tab on /sociallog
// (?tab=messages) instead of its own route — /sociallog/messages/[threadId]
// (a conversation's own page) is unaffected. Kept as a redirect so old
// bookmarks/links still land somewhere real.
export default function MessagesRedirect() {
  redirect('/sociallog?tab=messages');
}
