import { redirect } from 'next/navigation';

// /shoppinglog/sell (the create-listing form) is now a tab on /shoppinglog
// (?tab=sell) instead of its own route — /shoppinglog/sell/[id] (an
// existing listing's own edit page) is unaffected. Kept as a redirect so
// old bookmarks/links still land somewhere real.
export default function SellRedirect() {
  redirect('/shoppinglog?tab=sell');
}
