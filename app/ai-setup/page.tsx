// app/ai-setup/page.tsx
// Legacy route — BurnLog's AI setup moved to /burnlog/ai-setup, matching
// the rest of BurnLog's routes and every other app's namespacing
// (/moneylog, /tasklog, ...). The bare /ai-setup path is kept as an alias
// so old links (including any cached returnTo= chains) keep working.
import { redirect } from 'next/navigation';

export default async function AiSetupRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (typeof value === 'string') params.set(key, value);
  }
  const query = params.toString();
  redirect(`/burnlog/ai-setup${query ? `?${query}` : ''}`);
}
