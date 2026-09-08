// components/AppSwitchLottie.tsx
'use client';

import { Lottie } from 'lottie-react';

export function AppSwitchLottie({ path }: { path: string }) {
  return (
    <div className="w-[140px] h-[140px] flex items-center justify-center">
      <Lottie src={path} loop autoplay style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
