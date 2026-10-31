import { cn } from 'heroui-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModelDownloadButton } from '@/components/models/model-download-button';
import {
  GlassIconButton,
  Icon,
  LargeTitle,
  ModelMonogram,
  Text,
  View,
} from '@/components/ui';
import { getChatModels, totalBytes } from '@/features/models/catalog';
import type { CatalogModel } from '@/features/models/catalog-schema';
import { onboardingChoices } from '@/features/models/compatibility';
import { useDeviceInfo } from '@/features/models/use-device-info';
import { useModels } from '@/features/services';
import { formatBytes, formatParams } from '@/lib/format';

export function PickModelStep({
  onBack,
  onStartChat,
}: {
  onBack: () => void;
  onStartChat: (modelId: string) => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const device = useDeviceInfo();
  const { models, recommendedId } = useMemo(() => {
    // The simulator reports the Mac's RAM but runs on CPU, so offer only
    // the small models there; the library still lists everything.
    // First models are plain chat models; vision ones are picked later.
    const catalog = getChatModels().filter(
      (m) => !m.vision && (!device.isSimulator || m.simulatorFriendly)
    );
    return onboardingChoices(catalog, device.totalBytes);
  }, [device.isSimulator, device.totalBytes]);
  const [picked, setPicked] = useState(recommendedId ?? models[0]?.id);
  const downloads = useModels((s) => s.downloads);
  // Lock the choice while a download runs.
  const locked = Object.values(downloads).some(
    (d) =>
      d?.status === 'queued' ||
      d?.status === 'downloading' ||
      d?.status === 'verifying'
  );
  const selected = models.find((m) => m.id === picked);

  return (
    <View className="flex-1 bg-background" testID="onboarding-pick">
      <ScrollView
        contentContainerClassName="px-5"
        contentContainerStyle={{
          paddingTop: insets.top + 4,
          paddingBottom: 24,
        }}
      >
        <View className="h-12 justify-center">
          <GlassIconButton
            icon="chevron-back"
            accessibilityLabel={t('common.back')}
            onPress={onBack}
          />
        </View>
        <LargeTitle size={32} className="mx-2 mt-4">
          {t('onboarding.pick_title')}
        </LargeTitle>
        <Text className="mx-2 mt-2.5 text-[16px] leading-[23px] text-muted">
          {t('onboarding.pick_body', { ram: device.ramGB })}
        </Text>
        <View accessibilityRole="radiogroup" className="mt-5 gap-3">
          {models.map((model) => (
            <ModelChoice
              key={model.id}
              model={model}
              checked={model.id === picked}
              recommended={model.id === recommendedId}
              disabled={locked}
              onPress={() => setPicked(model.id)}
            />
          ))}
        </View>
      </ScrollView>
      <View className="px-5" style={{ paddingBottom: insets.bottom + 12 }}>
        {selected ? (
          <ModelDownloadButton
            testID="onboarding-download"
            model={selected}
            onStartChat={() => onStartChat(selected.id)}
          />
        ) : null}
        <Text className="mt-3.5 text-center text-[13px] text-muted">
          {t('onboarding.pick_footer')}
        </Text>
      </View>
    </View>
  );
}

function ModelChoice({
  model,
  checked,
  recommended,
  disabled,
  onPress,
}: {
  model: CatalogModel;
  checked: boolean;
  recommended: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const blurb = model.labels
    .slice(0, 3)
    .map((label) => t(`labels.${label}`))
    .join(' · ');
  return (
    <Pressable
      testID={`onboarding-model-${model.id}`}
      accessibilityRole="radio"
      accessibilityState={{ checked, disabled }}
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'flex-row items-center gap-3.5 rounded-[22px] bg-surface p-4 active:scale-[0.98]',
        checked ? 'border-2 border-accent-text' : 'border border-border'
      )}
    >
      <ModelMonogram name={model.name} family={model.family} size={44} />
      <View className="min-w-0 flex-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-[17px] font-semibold text-foreground">
            {model.name}
          </Text>
          {recommended ? (
            <View className="rounded-lg bg-accent-tint px-1.5 py-0.5">
              <Text className="text-[11px] font-bold tracking-wide text-accent-text">
                {t('onboarding.recommended')}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="text-[14px] leading-[20px] text-muted">{blurb}</Text>
        <Text
          className="text-[13px] text-muted"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {t('onboarding.size_line', {
            params: formatParams(model.params),
            size: formatBytes(totalBytes(model)),
          })}
        </Text>
      </View>
      <View
        className={cn(
          'size-6 items-center justify-center rounded-full',
          checked ? 'bg-accent' : 'border-2 border-radio'
        )}
      >
        {checked ? (
          <Icon name="checkmark" size={15} className="text-accent-foreground" />
        ) : null}
      </View>
    </Pressable>
  );
}
