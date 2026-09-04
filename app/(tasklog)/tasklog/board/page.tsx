import { redirect } from 'next/navigation';

// /tasklog/board is now a tab on /tasklog (?tab=board) instead of its own
// route. Kept as a redirect so old bookmarks/links still land somewhere real.
export default function BoardRedirect() {
  redirect('/tasklog?tab=board');
}
