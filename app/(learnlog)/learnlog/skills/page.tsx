import { redirect } from 'next/navigation';

// /learnlog/skills (the list) is now a tab on /learnlog (?tab=skills)
// instead of its own route — /learnlog/skills/[id] (a skill's own detail
// page) is unaffected. Kept as a redirect so old bookmarks/links still land
// somewhere real.
export default function SkillsRedirect() {
  redirect('/learnlog?tab=skills');
}
