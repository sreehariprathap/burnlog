import { redirect } from 'next/navigation';

// /moneylog/insights is now a tab on /moneylog (?tab=insights) instead of
// its own route. Kept as a redirect so old bookmarks/links still land
// somewhere real.
export default function InsightsRedirect() {
  redirect('/moneylog?tab=insights');
}
