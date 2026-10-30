import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Icon,
  type IconName,
  LargeTitle,
  ProgressButton,
  Text,
  View,
} from '@/components/ui';

import { MullLogo } from './mull-logo';

const PROMISES: { icon: IconName; key: 'device' | 'offline' | 'private' }[] = [
  { icon: 'hardware-chip-outline', key: 'device' },
  { icon: 'airplane-outline', key: 'offline' },
  { icon: 'lock-closed-outline', key: 'private' },
];

export function WelcomeStep({
  onContinue,
  onSkip,
}: {
  onContinue: () => void;
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background" testID="onboarding-welcome">
      <ScrollView
        contentContainerClassName="px-7"
        contentContainerStyle={{
          paddingTop: insets.top + 52,
          paddingBottom: 24,
        }}
      >
        <View className="flex-row items-start justify-between">
          <MullLogo size={88} />
          <Pressable
            testID="onboarding-skip"
            accessibilityRole="button"
            onPress={onSkip}
            hitSlop={12}
            className="min-h-11 justify-center px-2"
          >
            <Text className="text-[17px] text-accent-text">
              {t('onboarding.skip')}
            </Text>
          </Pressable>
        </View>
        <LargeTitle size={44} className="mt-7">
          Mull
        </LargeTitle>
        <Text className="mt-2.5 text-[22px] leading-[30px] tracking-tight text-label-secondary">
          {t('onboarding.tagline')}
        </Text>

        <View className="mt-10 gap-6">
          {PROMISES.map(({ icon, key }) => (
            <View key={key} className="flex-row items-start gap-4" accessible>
              <View className="size-10 items-center justify-center rounded-xl bg-accent-tint">
                <Icon name={icon} size={22} className="text-accent-text" />
              </View>
              <View className="flex-1">
                <Text className="text-[17px] font-semibold text-foreground">
                  {t(`onboarding.promises.${key}_title`)}
                </Text>
                <Text className="mt-0.5 text-[15px] leading-[22px] text-muted">
                  {t(`onboarding.promises.${key}_body`)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <View className="px-7" style={{ paddingBottom: insets.bottom + 12 }}>
        <ProgressButton
          testID="onboarding-continue"
          label={t('onboarding.continue')}
          onPress={onContinue}
        />
        <Text className="mt-3.5 text-center text-[13px] text-muted">
          {t('onboarding.next_step')}
        </Text>
      </View>
    </View>
  );
}
