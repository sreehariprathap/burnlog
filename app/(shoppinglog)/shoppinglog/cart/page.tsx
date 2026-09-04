import { redirect } from 'next/navigation';

// /shoppinglog/cart is now a tab on /shoppinglog (?tab=cart) instead of its
// own route. Kept as a redirect so old bookmarks/links still land somewhere
// real.
export default function CartRedirect() {
  redirect('/shoppinglog?tab=cart');
}
