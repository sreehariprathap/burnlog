import { redirect } from 'next/navigation';

// /tasklog/goals is now a tab on /tasklog (?tab=goals) instead of its own
// route. Kept as a redirect so old bookmarks/links still land somewhere real.
export default function GoalsRedirect() {
  redirect('/tasklog?tab=goals');
}
