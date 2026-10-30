import Constants from 'expo-constants';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import type { DrawerNavigationProp } from 'expo-router/drawer';
import { Slider, Switch, useToast } from 'heroui-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSheetIOS, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemeSelector } from '@/components/settings/theme-selector';
import {
  GlassIconButton,
  Icon,
  LargeTitle,
  ListRow,
  ListSection,
  ScreenHeader,
  SegmentedControl,
  Text,
  useHeaderInset,
  View,
} from '@/components/ui';
import { getRepos } from '@/db/client';
import { notifyChatsChanged } from '@/features/chat/chat-list-store';
import type { ResponseLength } from '@/features/chat/context-budget';
import { findCatalogModel, getCatalogModels } from '@/features/models/catalog';
import { chat, useModels } from '@/features/services';
import {
  TEMPERATURE_MAX,
  TEMPERATURE_MIN,
  TEMPERATURE_STEP,
  useSettings,
} from '@/features/settings/settings-store';
import { formatBytes, formatDecimal } from '@/lib/format';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const navigation =
    useNavigation<DrawerNavigationProp<Record<string, undefined>>>();
  const insets = useSafeAreaInsets();
  const headerInset = useHeaderInset();
  const { toast } = useToast();
  const settings = useSettings();
  const downloadedIds = useModels((s) => s.downloadedIds);
  const [presetCount, setPresetCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);

  useFocusEffect(
    useCallback(() => {
      const repos = getRepos();
      void repos.presets.list().then((p) => setPresetCount(p.length));
      void repos.chats.list().then((c) => setChatCount(c.length));
    }, [])
  );

  const modelsBytes = getCatalogModels()
    .filter((m) => downloadedIds.includes(m.id))
    .reduce((sum, m) => sum + m.sizeBytes, 0);

  const deleteAllChats = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        message: t('settings.delete_all_body', { count: chatCount }),
        options: [t('settings.delete_all'), t('common.cancel')],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      async (index) => {
        if (index !== 0) return;
        await getRepos().chats.removeAll();
        chat.startNew();
        notifyChatsChanged();
        setChatCount(0);
        toast.show({ label: t('settings.delete_all_done') });
      }
    );
  };

  const version = `${Constants.expoConfig?.version ?? '0.0.0'}`;
  const licenses = Array.from(
    new Set(getCatalogModels().map((m) => m.license))
  ).join(', ');

  return (
    <View className="flex-1 bg-background" testID="settings-screen">
      <ScrollView
        contentContainerClassName="gap-[22px] px-4"
        contentContainerStyle={{
          paddingTop: headerInset + 4,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <LargeTitle className="mx-1">{t('settings.title')}</LargeTitle>

        <ListSection title={t('settings.chat')}>
          <ListRow
            testID="settings-default-model"
            title={t('settings.default_model')}
            value={
              findCatalogModel(settings.defaultModelId)?.name ??
              t('settings.none')
            }
            onPress={() =>
              router.push({
                pathname: '/model-picker',
                params: { mode: 'default' },
              })
            }
          />
          <ListRow
            testID="settings-prompts"
            title={t('settings.system_prompt')}
            value={String(presetCount)}
            onPress={() => router.push('/settings/prompts')}
          />
        </ListSection>

        <ListSection
          title={t('settings.responses')}
          footer={t('settings.temperature_hint')}
        >
          <View className="gap-2 px-4 py-3.5">
            <Slider
              testID="settings-temperature"
              value={settings.temperature}
              minValue={TEMPERATURE_MIN}
              maxValue={TEMPERATURE_MAX}
              step={TEMPERATURE_STEP}
              onChange={(value) =>
                settings.setTemperature(Array.isArray(value) ? value[0] : value)
              }
              accessibilityLabel={t('settings.temperature')}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-[17px] text-foreground">
                  {t('settings.temperature')}
                </Text>
                <Text
                  className="text-[17px] text-muted"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatDecimal(settings.temperature)}
                </Text>
              </View>
              <Slider.Track className="mt-2">
                <Slider.Fill />
                <Slider.Thumb />
              </Slider.Track>
            </Slider>
            <View className="flex-row justify-between">
              <Text className="text-[13px] text-muted">
                {t('settings.temperature_focused')}
              </Text>
              <Text className="text-[13px] text-muted">
                {t('settings.temperature_creative')}
              </Text>
            </View>
          </View>
          <View className="gap-2.5 px-4 py-3.5">
            <Text className="text-[17px] text-foreground">
              {t('settings.length.title')}
            </Text>
            <SegmentedControl<ResponseLength>
              accessibilityLabel={t('settings.length.title')}
              value={settings.responseLength}
              onChange={(responseLength) => settings.update({ responseLength })}
              options={(['short', 'medium', 'long'] as const).map((value) => ({
                value,
                label: t(`settings.length.${value}`),
                testID: `settings-length-${value}`,
              }))}
            />
          </View>
        </ListSection>

        <ListSection title={t('settings.appearance')}>
          <View className="px-4 py-3.5">
            <ThemeSelector />
          </View>
        </ListSection>

        <ListSection title={t('settings.downloads_data')}>
          <View className="min-h-[52px] flex-row items-center gap-3 px-4 py-2">
            <Text className="flex-1 text-[17px] text-foreground">
              {t('settings.cellular')}
            </Text>
            <Switch
              testID="settings-cellular"
              accessibilityLabel={t('settings.cellular')}
              isSelected={settings.allowCellular}
              onSelectedChange={(allowCellular) =>
                settings.update({ allowCellular })
              }
            />
          </View>
          <ListRow
            testID="settings-storage"
            title={t('settings.storage')}
            value={formatBytes(modelsBytes)}
            onPress={() => router.push('/settings/storage')}
          />
          <ListRow
            testID="settings-delete-all"
            title={t('settings.delete_all')}
            destructive
            chevron={false}
            onPress={deleteAllChats}
          />
        </ListSection>

        <ListSection title={t('settings.about')}>
          <View className="flex-row gap-3 px-4 py-3.5" accessible>
            <View className="size-8 items-center justify-center rounded-[10px] bg-accent-tint">
              <Icon
                name="lock-closed-outline"
                size={18}
                className="text-accent-text"
              />
            </View>
            <View className="flex-1 gap-0.5">
              <Text className="text-[17px] text-foreground">
                {t('settings.privacy')}
              </Text>
              <Text className="text-[13px] leading-[19px] text-muted">
                {t('settings.privacy_body')}
              </Text>
            </View>
          </View>
          <ListRow title={t('settings.version')} value={version} />
          <ListRow title={t('settings.licenses')} subtitle={licenses} />
        </ListSection>
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
      />
    </View>
  );
}
