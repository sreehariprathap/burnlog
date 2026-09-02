export type ToggleRow = {
  key: string;
  type: 'app' | 'feature';
  globallyEnabled: boolean;
};

export type ToggleOverrideRow = {
  enabled: boolean;
};

/**
 * Single source of truth for whether an app or beta feature is on for a
 * given user. Precedence: per-user override beats everything; then the
 * global switch; then — for 'app' toggles only — the user's own
 * enabledApps preference (feature toggles have no self-service opt-in).
 */
export function resolveToggle(
  toggle: ToggleRow,
  override: ToggleOverrideRow | null,
  profile: { enabledApps: string[] }
): boolean {
  if (override) return override.enabled;
  if (!toggle.globallyEnabled) return false;
  if (toggle.type === 'app') {
    const appId = toggle.key.replace(/^app:/, '');
    return profile.enabledApps.includes(appId);
  }
  return true;
}
