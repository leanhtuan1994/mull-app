import { useNavigation } from 'expo-router';
import type { DrawerNavigationProp } from 'expo-router/drawer';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrawerScene } from '@/components/drawer/drawer-scene';
import { ModelRow } from '@/components/models/model-row';
import {
  GlassIconButton,
  GlassPill,
  Icon,
  LargeTitle,
  ListSection,
  ScreenHeader,
  SegmentedControl,
  Text,
  useHeaderInset,
  View,
} from '@/components/ui';
import { getCatalogModels, getChatModels } from '@/features/models/catalog';
import { groupModels, memoryBudgetGB } from '@/features/models/compatibility';
import { isActiveDownload } from '@/features/models/download-machine';
import { useDeviceInfo } from '@/features/models/use-device-info';
import { useModels } from '@/features/services';
import { formatParams } from '@/lib/format';

type Filter = 'all' | 'mine';

/** Rough largest model size that fits: Q4_K_M is about 0.6 GB per billion parameters. */
function comfortableParams(totalBytes: number) {
  return Math.floor((memoryBudgetGB(totalBytes) - 0.3) / 0.6);
}

export default function ModelsScreen() {
  const { t } = useTranslation();
  const navigation =
    useNavigation<DrawerNavigationProp<Record<string, undefined>>>();
  const insets = useSafeAreaInsets();
  const headerInset = useHeaderInset();
  const device = useDeviceInfo();
  const [filter, setFilter] = useState<Filter>('all');
  const downloadedIds = useModels((s) => s.downloadedIds);
  const activeCount = useModels(
    (s) => Object.values(s.downloads).filter((d) => isActiveDownload(d)).length
  );

  const groups = useMemo(
    () =>
      groupModels(getChatModels(), device.totalBytes, new Set(downloadedIds)),
    [device.totalBytes, downloadedIds]
  );
  const params = comfortableParams(device.totalBytes);
  // Models that index documents rather than chat; shown in their own section.
  const documentModels = getCatalogModels().filter(
    (m) =>
      m.kind === 'embedding' &&
      (filter === 'all' || downloadedIds.includes(m.id))
  );

  return (
    <DrawerScene>
      <View className="flex-1 bg-background" testID="models-screen">
        <ScrollView
          contentContainerClassName="px-4 gap-[22px]"
          contentContainerStyle={{
            paddingTop: headerInset + 4,
            paddingBottom: insets.bottom + 40,
          }}
        >
          <View className="gap-3.5">
            <LargeTitle className="mx-1">{t('models.title')}</LargeTitle>
            <View
              className="flex-row items-center gap-3 rounded-[22px] bg-surface px-4 py-3.5"
              accessible
            >
              <View className="size-9 items-center justify-center rounded-[11px] bg-accent-tint">
                <Icon
                  name="phone-portrait-outline"
                  size={20}
                  className="text-accent-text"
                />
              </View>
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  {t('models.device_card', {
                    device: device.name,
                    ram: device.ramGB,
                  })}
                </Text>
                <Text className="text-[13px] leading-[18px] text-muted">
                  {params >= 2
                    ? t('models.device_card_body', {
                        params: formatParams(params),
                      })
                    : t('models.device_card_body_small')}
                </Text>
              </View>
            </View>
            <SegmentedControl<Filter>
              accessibilityLabel={t('models.filter')}
              value={filter}
              onChange={setFilter}
              options={[
                {
                  value: 'all',
                  label: t('models.filter_all'),
                  testID: 'models-filter-all',
                },
                {
                  value: 'mine',
                  label: t('models.filter_mine'),
                  testID: 'models-filter-mine',
                },
              ]}
            />
          </View>

          {groups.onDevice.length > 0 ? (
            <ListSection
              title={t('models.on_device')}
              testID="models-on-device"
            >
              {groups.onDevice.map((model) => (
                <ModelRow key={model.id} model={model} blocked={false} />
              ))}
            </ListSection>
          ) : null}

          {filter === 'all' && groups.runsWell.length > 0 ? (
            <ListSection
              title={t('models.runs_well')}
              footer={t('models.runs_well_footer')}
              testID="models-runs-well"
            >
              {groups.runsWell.map((model) => (
                <ModelRow key={model.id} model={model} blocked={false} />
              ))}
            </ListSection>
          ) : null}

          {documentModels.length > 0 ? (
            <ListSection
              title={t('models.for_documents')}
              footer={t('models.for_documents_footer')}
              testID="models-for-documents"
            >
              {documentModels.map((model) => (
                <ModelRow key={model.id} model={model} blocked={false} />
              ))}
            </ListSection>
          ) : null}

          {filter === 'all' && groups.needsMore.length > 0 ? (
            <ListSection
              title={t('models.needs_more')}
              footer={t('models.needs_more_footer')}
              testID="models-needs-more"
            >
              {groups.needsMore.map((model) => (
                <ModelRow key={model.id} model={model} blocked />
              ))}
            </ListSection>
          ) : null}
        </ScrollView>

        <ScreenHeader
          left={
            <GlassIconButton
              testID="open-drawer"
              icon="menu"
              accessibilityLabel={t('chat.open_drawer')}
              onPress={() => navigation.openDrawer()}
            />
          }
          right={
            activeCount > 0 ? (
              <GlassPill testID="active-downloads" className="h-9">
                <View className="size-2 rounded-full bg-accent-text" />
                <Text
                  className="text-[14px] font-semibold text-foreground"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {t('downloads.active', { count: activeCount })}
                </Text>
              </GlassPill>
            ) : null
          }
        />
      </View>
    </DrawerScene>
  );
}
