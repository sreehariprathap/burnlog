import { redirect } from 'next/navigation';

// /travellog/map is now a tab on /travellog (?tab=map) instead of its own
// route. Kept as a redirect so old bookmarks/links still land somewhere real.
export default function MapRedirect() {
  redirect('/travellog?tab=map');
}
