import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';

import { PickModelStep } from '@/components/onboarding/pick-model-step';
import { WelcomeStep } from '@/components/onboarding/welcome-step';
import { useSettings } from '@/features/settings/settings-store';

export default function OnboardingScreen() {
  const [step, setStep] = useState<'welcome' | 'pick'>('welcome');
  const update = useSettings((s) => s.update);

  const finish = (modelId?: string) => {
    update({
      onboardingDone: true,
      ...(modelId ? { defaultModelId: modelId } : {}),
    });
    router.replace(modelId ? { pathname: '/', params: { modelId } } : '/');
  };

  if (step === 'welcome') {
    return (
      <WelcomeStep onContinue={() => setStep('pick')} onSkip={() => finish()} />
    );
  }
  return (
    <PickModelStep
      onBack={() => setStep('welcome')}
      onStartChat={(modelId) => {
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success
        );
        finish(modelId);
      }}
    />
  );
}
