import { redirect } from 'next/navigation';

// /travellog/plan is now a tab on /travellog (?tab=plan) instead of its own
// route. Kept as a redirect so old bookmarks/links still land somewhere
// real — note callers that used to pass ?destination=/&startDate=/etc to
// this route should be updated to route through /travellog?tab=plan&...
// directly (see SuggestionsContent), since a redirect drops query params.
export default function PlanRedirect() {
  redirect('/travellog?tab=plan');
}
