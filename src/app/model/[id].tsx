import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModelDownloadButton } from '@/components/models/model-download-button';
import {
  Icon,
  LargeTitle,
  ListRow,
  ListSection,
  ModelMonogram,
  Text,
  View,
} from '@/components/ui';
import { findCatalogModel } from '@/features/models/catalog';
import {
  fitsDevice,
  minimumRamGB,
  modelCostGB,
} from '@/features/models/compatibility';
import { useDeviceInfo } from '@/features/models/use-device-info';
import {
  formatBytes,
  formatDecimal,
  formatInteger,
  formatParams,
} from '@/lib/format';

export default function ModelDetailSheet() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const device = useDeviceInfo();
  const model = findCatalogModel(id);
  if (!model) return null;

  const fits = fitsDevice(model, device.totalBytes);
  const stats = [
    { label: t('models.params'), value: `${formatParams(model.params)}B` },
    { label: t('models.download_size'), value: formatBytes(model.sizeBytes) },
    {
      label: t('models.context'),
      value: t('models.context_value', {
        tokens: formatInteger(model.contextTokens),
      }),
    },
    { label: t('models.format'), value: model.quant },
  ];

  return (
    <ScrollView
      testID="model-detail"
      className="flex-1 bg-background"
      contentContainerClassName="px-5 pt-3"
      contentContainerStyle={{ paddingBottom: insets.bottom + 34 }}
    >
      <View className="flex-row justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
          className="size-9 items-center justify-center rounded-full bg-fill"
        >
          <Icon name="close" size={18} className="text-muted" />
        </Pressable>
      </View>

      <View className="items-center">
        <ModelMonogram name={model.name} family={model.family} size={72} />
        <LargeTitle size={28} className="mt-3.5 text-center">
          {model.name}
        </LargeTitle>
        <Text className="mt-1.5 text-center text-[15px] text-muted">
          {model.publisher} · {t('models.license', { license: model.license })}
        </Text>
        <View
          className={
            fits
              ? 'mt-3 flex-row items-center gap-1.5 rounded-[14px] bg-ok-background px-3 py-1.5'
              : 'mt-3 flex-row items-center gap-1.5 rounded-[14px] bg-fill px-3 py-1.5'
          }
        >
          <Icon
            name={fits ? 'checkmark-circle' : 'alert-circle-outline'}
            size={15}
            className={fits ? 'text-ok-foreground' : 'text-muted'}
          />
          <Text
            className={
              fits
                ? 'text-[13px] font-semibold text-ok-foreground'
                : 'text-[13px] font-semibold text-muted'
            }
          >
            {fits
              ? t('models.fits')
              : t('models.needs_more_detail', { ram: minimumRamGB(model) })}
          </Text>
        </View>
      </View>

      {fits ? (
        <View className="mt-[22px]">
          <ModelDownloadButton
            testID="model-detail-download"
            model={model}
            progressStyle="bytes"
            onStartChat={() => {
              router.back();
              router.navigate({
                pathname: '/',
                params: { modelId: model.id, new: String(Date.now()) },
              });
            }}
          />
        </View>
      ) : null}

      <View className="mt-5 flex-row flex-wrap gap-2.5">
        {stats.map((stat) => (
          <View
            key={stat.label}
            className="grow basis-[45%] rounded-[20px] bg-surface px-4 py-3.5"
            accessible
          >
            <Text className="text-[13px] text-muted">{stat.label}</Text>
            <Text className="mt-0.5 font-rounded text-[22px] font-extrabold text-foreground">
              {stat.value}
            </Text>
          </View>
        ))}
      </View>

      <Text
        accessibilityRole="header"
        className="mx-1 mt-6 mb-1.5 text-[20px] font-bold text-foreground"
      >
        {t('models.about')}
      </Text>
      <Text className="mx-1 text-[16px] leading-[25px] text-label-secondary">
        {model.description[i18n.language === 'en' ? 'en' : 'vi']}
      </Text>
      <View className="mx-1 mt-3 flex-row flex-wrap gap-2">
        {model.labels.map((label) => (
          <View key={label} className="rounded-[14px] bg-fill px-3 py-1.5">
            <Text className="text-[14px] text-foreground">
              {t(`labels.${label}`)}
            </Text>
          </View>
        ))}
        {model.simulatorFriendly ? (
          <View className="rounded-[14px] bg-fill px-3 py-1.5">
            <Text className="text-[14px] text-foreground">
              {t('models.simulator_hint')}
            </Text>
          </View>
        ) : null}
      </View>

      <ListSection className="mt-6">
        <ListRow title={t('models.source')} value="Hugging Face" />
        <ListRow
          title={t('models.run_memory')}
          value={`~${formatDecimal(modelCostGB(model))} GB`}
        />
      </ListSection>
    </ScrollView>
  );
}
