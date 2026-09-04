import { redirect } from 'next/navigation';

// /logbook/myday used to be its own route — MyDay is now a tab on /logbook
// (?tab=myday) instead. Kept as a redirect so old bookmarks/links/PWA
// shortcuts still land somewhere real.
export default function MyDayRedirect() {
  redirect('/logbook?tab=myday');
}
