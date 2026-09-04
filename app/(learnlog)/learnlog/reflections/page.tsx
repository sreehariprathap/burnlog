import { redirect } from 'next/navigation';

// /learnlog/reflections is now a tab on /learnlog (?tab=reflections)
// instead of its own route. Kept as a redirect so old bookmarks/links still
// land somewhere real.
export default function ReflectionsRedirect() {
  redirect('/learnlog?tab=reflections');
}
