// lib/theme/uiVersion.ts
//
// AdminLog > UI > "v2 (Beta)" — a single global boolean that switches core
// chrome primitives (Button/Card/Input/bottom-nav) between today's flat
// look and the glass look. No per-app override — see
// UiVersionSettingsEffect for how this gets applied as a data attribute.
import { apiFetch } from '@/lib/apiFetch';

export const UI_VERSION_KEY = 'adminlog-ui-version-settings';

export async function fetchUiVersion(): Promise<{ enabled: boolean }> {
  const res = await apiFetch('/api/adminlog/ui-version');
  if (!res.ok) return { enabled: false };
  return res.json();
}
