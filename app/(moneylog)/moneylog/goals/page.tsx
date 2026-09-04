import { redirect } from 'next/navigation';

// /moneylog/goals is now a tab on /moneylog (?tab=goals) instead of its own
// route. Kept as a redirect so old bookmarks/links still land somewhere real.
export default function GoalsRedirect() {
  redirect('/moneylog?tab=goals');
}
