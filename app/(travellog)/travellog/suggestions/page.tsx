import { redirect } from 'next/navigation';

// /travellog/suggestions is now a tab on /travellog (?tab=suggestions)
// instead of its own route. Kept as a redirect so old bookmarks/links still
// land somewhere real.
export default function SuggestionsRedirect() {
  redirect('/travellog?tab=suggestions');
}
