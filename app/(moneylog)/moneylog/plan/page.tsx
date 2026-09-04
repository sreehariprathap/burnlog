import { redirect } from 'next/navigation';

// /moneylog/plan is now a tab on /moneylog (?tab=plan) instead of its own
// route. Kept as a redirect so old bookmarks/links still land somewhere real.
export default function PlanRedirect() {
  redirect('/moneylog?tab=plan');
}
