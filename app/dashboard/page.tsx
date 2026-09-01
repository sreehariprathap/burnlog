// app/dashboard/page.tsx
// Legacy route — BurnLog's dashboard moved to /burnlog/dashboard, and other
// apps' routes are namespaced the same way (/moneylog, /tasklog, ...).
// The bare /dashboard path is kept as an alias to Logbook, the app's home.
import { redirect } from 'next/navigation';

export default function DashboardRedirect() {
  redirect('/logbook');
}
