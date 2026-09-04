import { redirect } from 'next/navigation';

// /learnlog/library is now a tab on /learnlog (?tab=library) instead of its
// own route. Kept as a redirect so old bookmarks/links still land somewhere
// real.
export default function LibraryRedirect() {
  redirect('/learnlog?tab=library');
}
