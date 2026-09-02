import { describe, it, expect } from 'vitest';
import { resolveToggle, type ToggleRow, type ToggleOverrideRow } from './resolveToggle';

const appToggle: ToggleRow = { key: 'app:moneylog', type: 'app', globallyEnabled: true };
const featureToggle: ToggleRow = { key: 'feature:beta-x', type: 'feature', globallyEnabled: true };

describe('resolveToggle', () => {
  it('per-user override wins even when global is on and user preference is off', () => {
    const override: ToggleOverrideRow = { enabled: true };
    expect(resolveToggle(appToggle, override, { enabledApps: [] })).toBe(true);
  });

  it('per-user override wins even when global is off', () => {
    const off = { ...appToggle, globallyEnabled: false };
    const override: ToggleOverrideRow = { enabled: true };
    expect(resolveToggle(off, override, { enabledApps: [] })).toBe(true);
  });

  it('per-user override can force off even when global is on and user opted in', () => {
    const override: ToggleOverrideRow = { enabled: false };
    expect(resolveToggle(appToggle, override, { enabledApps: ['moneylog'] })).toBe(false);
  });

  it('global off wins over user preference when there is no override', () => {
    const off = { ...appToggle, globallyEnabled: false };
    expect(resolveToggle(off, null, { enabledApps: ['moneylog'] })).toBe(false);
  });

  it('app type falls back to the user\'s own enabledApps when global is on and no override', () => {
    expect(resolveToggle(appToggle, null, { enabledApps: ['moneylog'] })).toBe(true);
    expect(resolveToggle(appToggle, null, { enabledApps: [] })).toBe(false);
  });

  it('feature type defaults to on when global is on and no override, regardless of enabledApps', () => {
    expect(resolveToggle(featureToggle, null, { enabledApps: [] })).toBe(true);
  });

  it('feature type is off when global is off and no override', () => {
    const off = { ...featureToggle, globallyEnabled: false };
    expect(resolveToggle(off, null, { enabledApps: [] })).toBe(false);
  });
});
