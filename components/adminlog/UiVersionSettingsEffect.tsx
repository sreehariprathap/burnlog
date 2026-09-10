'use client';

import { useEffect } from 'react';
import useSWR from 'swr';
import { UI_VERSION_KEY, fetchUiVersion } from '@/lib/theme/uiVersion';

/** Mounted once in RootLayoutClient. Stamps data-ui-version="v1"|"v2" on
 * <html> from the global admin toggle — every --surface-* CSS variable in
 * app/globals.css is keyed off that attribute. */
export function UiVersionSettingsEffect() {
  const { data } = useSWR(UI_VERSION_KEY, fetchUiVersion, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-ui-version', data?.enabled ? 'v2' : 'v1');
  }, [data?.enabled]);

  return null;
}
