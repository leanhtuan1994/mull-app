import { router, useFocusEffect } from 'expo-router';
import { useToast } from 'heroui-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  Icon,
  LargeTitle,
  ListSection,
  ModelMonogram,
  ScreenHeader,
  Text,
  useHeaderInset,
  View,
} from '@/components/ui';
import { findCatalogModel } from '@/features/models/catalog';
import {
  readStorageStats,
  type StorageStats,
} from '@/features/models/storage-stats';
import { getModels, useLlm, useModels } from '@/features/services';
import { formatBytes } from '@/lib/format';

import { MullFiles } from '../../../../modules/mull-files';

export default function StorageScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const headerInset = useHeaderInset();
  const { toast } = useToast();
  const downloadedIds = useModels((s) => s.downloadedIds);
  const loadedModelId = useLlm((s) => s.loadedModelId);
  const [stats, setStats] = useState<StorageStats | null>(null);

  const refresh = useCallback(() => {
    const models = getModels();
    models
      .idlePartials()
      .then((partial) =>
        readStorageStats(MullFiles, {
          complete: Object.values(models.store.getState().paths),
          partial,
        })
      )
      .then(setStats)
      .catch(() => undefined);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const models = downloadedIds
    .map((id) => findCatalogModel(id))
    .filter((m) => m !== undefined)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  const remove = (id: string, name: string) => {
    Alert.alert(t('storage.remove_confirm', { model: name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await getModels().remove(id);
          refresh();
        },
      },
    ]);
  };

  const clearCache = async () => {
    await getModels().clearPartials();
    const freed = await MullFiles.clearCaches();
    toast.show({
      label: t('storage.clear_cache_done', { size: formatBytes(freed) }),
    });
    refresh();
  };

  const total = stats?.totalBytes || 1;
  const segments = stats
    ? [
        {
          key: 'models',
          label: t('storage.models'),
          bytes: stats.modelsBytes,
          color: 'bg-accent',
        },
        {
          key: 'data',
          label: t('storage.chats_cache'),
          bytes: stats.dataBytes,
          color: 'bg-accent-text',
        },
        {
          key: 'other',
          label: t('storage.other'),
          bytes: stats.otherBytes,
          color: 'bg-other',
        },
        {
          key: 'free',
          label: t('storage.free'),
          bytes: stats.freeBytes,
          color: 'bg-track',
        },
      ]
    : [];
  const mullBytes = (stats?.modelsBytes ?? 0) + (stats?.dataBytes ?? 0);

  return (
    <View className="flex-1 bg-background" testID="storage-screen">
      <ScrollView
        contentContainerClassName="gap-[22px] px-4"
        contentContainerStyle={{
          paddingTop: headerInset + 4,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <LargeTitle className="mx-1">{t('storage.title')}</LargeTitle>

        <View className="gap-3 rounded-[22px] bg-surface p-4">
          <Text className="text-[13px] text-muted">
            {t('storage.used_by_mull')}
          </Text>
          <Text
            testID="storage-used"
            className="font-rounded text-[30px] font-extrabold text-foreground"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatBytes(mullBytes)}
          </Text>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={t('storage.meter_label', {
              used: formatBytes(mullBytes),
              free: formatBytes(stats?.freeBytes ?? 0),
            })}
            className="h-3 flex-row gap-0.5 overflow-hidden rounded-full"
          >
            {segments.map((segment) => (
              <View
                key={segment.key}
                className={`h-full ${segment.color}`}
                style={{
                  width: `${Math.max(segment.bytes > 0 ? 1 : 0, (segment.bytes / total) * 100)}%`,
                }}
              />
            ))}
          </View>
          <View className="gap-1.5">
            {segments.map((segment) => (
              <View key={segment.key} className="flex-row items-center gap-2">
                <View className={`size-2.5 rounded-full ${segment.color}`} />
                <Text className="flex-1 text-[15px] text-foreground">
                  {segment.label}
                </Text>
                <Text
                  className="text-[15px] text-muted"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatBytes(segment.bytes)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <ListSection
          title={t('storage.models')}
          footer={t('storage.remove_note')}
        >
          {models.length === 0 ? (
            <View className="px-4 py-3.5">
              <Text className="text-[15px] text-muted">
                {t('storage.no_models')}
              </Text>
            </View>
          ) : (
            models.map((model) => {
              const inUse = model.id === loadedModelId;
              return (
                <View
                  key={model.id}
                  className="min-h-[62px] flex-row items-center gap-3 pr-2 pl-4"
                >
                  <ModelMonogram
                    name={model.name}
                    family={model.family}
                    size={34}
                  />
                  <View className="flex-1">
                    <Text className="text-[17px] text-foreground">
                      {model.name}
                    </Text>
                    <Text className="text-[13px] text-muted">
                      {formatBytes(model.sizeBytes)}
                    </Text>
                  </View>
                  {inUse ? (
                    <Text className="pr-2 text-[13px] text-muted">
                      {t('models.in_use')}
                    </Text>
                  ) : (
                    <Pressable
                      testID={`storage-remove-${model.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={t('storage.remove_model', {
                        model: model.name,
                      })}
                      onPress={() => remove(model.id, model.name)}
                      className="size-11 items-center justify-center"
                    >
                      <Icon
                        name="trash-outline"
                        size={20}
                        className="text-danger"
                      />
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </ListSection>

        <ListSection>
          <Pressable
            testID="storage-clear-cache"
            accessibilityRole="button"
            onPress={() => void clearCache()}
            className="min-h-[52px] flex-row items-center px-4 active:bg-fill"
          >
            <Text className="flex-1 text-[17px] text-accent-text">
              {t('storage.clear_cache')}
            </Text>
            <Text className="text-[17px] text-muted">
              {stats && stats.cacheBytes > 0
                ? formatBytes(stats.cacheBytes)
                : t('storage.empty')}
            </Text>
          </Pressable>
        </ListSection>
      </ScrollView>

      <ScreenHeader
        left={
          <GlassIconButton
            testID="storage-back"
            icon="chevron-back"
            accessibilityLabel={t('storage.back')}
            onPress={() => router.navigate('/settings')}
          />
        }
      />
    </View>
  );
}
