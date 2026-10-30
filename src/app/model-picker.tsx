import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';

import {
  Icon,
  ListRow,
  ListSection,
  ModelMonogram,
  Text,
  View,
} from '@/components/ui';
import { getRepos } from '@/db/client';
import { findCatalogModel } from '@/features/models/catalog';
import { chat, useChat, useModels } from '@/features/services';
import { useSettings } from '@/features/settings/settings-store';
import { formatBytes } from '@/lib/format';

/**
 * Pick a downloaded model. From a chat (default) it switches that chat;
 * with `mode=default` (from Settings) it sets the default model instead.
 */
export default function ModelPickerSheet() {
  const { t } = useTranslation();
  const { mode } = useLocalSearchParams<{ mode?: 'default' }>();
  const forDefault = mode === 'default';
  const downloadedIds = useModels((s) => s.downloadedIds);
  const chatModelId = useChat((s) => s.modelId);
  const defaultModelId = useSettings((s) => s.defaultModelId);
  const update = useSettings((s) => s.update);
  const selectedId = forDefault
    ? defaultModelId
    : (chatModelId ?? defaultModelId);
  const presetName = useDefaultPresetName();

  const models = downloadedIds
    .map((id) => findCatalogModel(id))
    .filter((m) => m !== undefined)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);

  const pick = (id: string) => {
    void Haptics.selectionAsync();
    if (forDefault) update({ defaultModelId: id });
    else void chat.switchModel(id);
    router.back();
  };

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-3 pb-10"
    >
      <View className="h-[52px] flex-row items-center justify-between">
        <View className="w-16" />
        <Text
          accessibilityRole="header"
          className="text-[17px] font-semibold text-foreground"
        >
          {forDefault ? t('settings.default_model') : t('model_picker.title')}
        </Text>
        <Pressable
          testID="model-picker-done"
          accessibilityRole="button"
          onPress={() => router.back()}
          className="min-h-11 w-16 items-end justify-center"
        >
          <Text className="text-[17px] font-semibold text-accent-text">
            {t('common.done')}
          </Text>
        </Pressable>
      </View>

      <ListSection
        title={t('model_picker.on_device')}
        footer={t('model_picker.footnote')}
      >
        {models.map((model) => {
          const checked = model.id === selectedId;
          return (
            <Pressable
              key={model.id}
              testID={`model-picker-${model.id}`}
              accessibilityRole="radio"
              accessibilityState={{ checked }}
              onPress={() => pick(model.id)}
              className="min-h-[62px] flex-row items-center gap-3 px-4 active:bg-fill"
            >
              <ModelMonogram
                name={model.name}
                family={model.family}
                size={34}
              />
              <View className="min-w-0 flex-1">
                <Text className="text-[17px] text-foreground">
                  {model.name}
                </Text>
                <Text className="text-[13px] text-muted">
                  {[
                    model.labels[0] && t(`labels.${model.labels[0]}`),
                    formatBytes(model.sizeBytes),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {checked ? (
                <Icon name="checkmark" size={20} className="text-accent-text" />
              ) : null}
            </Pressable>
          );
        })}
      </ListSection>

      <ListSection className="mt-[18px]">
        {!forDefault ? (
          <ListRow
            testID="model-picker-prompts"
            title={t('model_picker.system_prompt')}
            value={presetName}
            onPress={() => {
              router.back();
              router.navigate('/settings/prompts');
            }}
          />
        ) : null}
        <ListRow
          testID="model-picker-more"
          title={t('model_picker.get_more')}
          accent
          onPress={() => {
            router.back();
            router.navigate('/models');
          }}
        />
      </ListSection>
    </ScrollView>
  );
}

function useDefaultPresetName() {
  const [name, setName] = useState<string>();
  useEffect(() => {
    getRepos()
      .presets.getDefault()
      .then((preset) => setName(preset?.name))
      .catch(() => undefined);
  }, []);
  return name;
}
