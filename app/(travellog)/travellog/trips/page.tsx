import { redirect } from 'next/navigation';

// /travellog/trips (the list) is now a tab on /travellog (?tab=trips)
// instead of its own route — /travellog/trips/[id] (a trip's own detail
// page) is unaffected. Kept as a redirect so old bookmarks/links still land
// somewhere real.
export default function TripsRedirect() {
  redirect('/travellog?tab=trips');
}
