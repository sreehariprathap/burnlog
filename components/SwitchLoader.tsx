// components/SwitchLoader.tsx
'use client';

import { useAppSwitch } from '@/lib/appSwitchContext';
import { APPS } from '@/lib/appMode';
import {
  APP_SWITCH_LOADING_STATES,
  APP_SWITCH_STEP_DURATION_MS,
} from '@/lib/appSwitchLoadingStates';
import { MultiStepLoader } from '@/components/ui/multi-step-loader';
import { AppSwitchLottie } from '@/components/AppSwitchLottie';
import { useAppSwitchLottie } from '@/lib/loadingAnimations';

export function SwitchLoader() {
  const { switchingTo } = useAppSwitch();
  const animations = useAppSwitchLottie();

  if (!switchingTo) return null;

  const app = APPS[switchingTo];
  const resolved = animations[switchingTo];
  const icon = resolved ? <AppSwitchLottie src={resolved.src ?? ''} kind={resolved.kind} /> : undefined;

  return (
    <MultiStepLoader
      loading
      duration={APP_SWITCH_STEP_DURATION_MS}
      icon={icon}
      loadingStates={[
        { text: `Switching to ${app.name}…` },
        ...APP_SWITCH_LOADING_STATES[switchingTo],
      ]}
    />
  );
}
