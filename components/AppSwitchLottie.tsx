// components/AppSwitchLottie.tsx
'use client';

import { Lottie } from 'lottie-react';
import SiriOrb from '@/components/smoothui/siri-orb';

export function AppSwitchLottie({
  src,
  kind = 'lottie',
}: {
  src: string | object;
  kind?: 'lottie' | 'siri_orb';
}) {
  return (
    <div className="w-[140px] h-[140px] flex items-center justify-center">
      {kind === 'siri_orb' ? (
        <SiriOrb state="thinking" size="96px" />
      ) : (
        <Lottie src={src} loop autoplay style={{ width: '100%', height: '100%' }} />
      )}
    </div>
  );
}
