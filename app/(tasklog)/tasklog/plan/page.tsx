import { redirect } from 'next/navigation';

// /tasklog/plan is now a tab on /tasklog (?tab=plan) instead of its own
// route. Kept as a redirect so old bookmarks/links still land somewhere real.
export default function PlanRedirect() {
  redirect('/tasklog?tab=plan');
}
