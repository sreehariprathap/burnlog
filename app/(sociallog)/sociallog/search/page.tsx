import { redirect } from 'next/navigation';

// /sociallog/search is now a tab on /sociallog (?tab=search) instead of its
// own route. Kept as a redirect so old bookmarks/links still land somewhere
// real.
export default function SearchRedirect() {
  redirect('/sociallog?tab=search');
}
