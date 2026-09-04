import { redirect } from 'next/navigation';

// /learnlog/career is now a tab on /learnlog (?tab=career) instead of its
// own route. Kept as a redirect so old bookmarks/links still land somewhere
// real.
export default function CareerRedirect() {
  redirect('/learnlog?tab=career');
}
