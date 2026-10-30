import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { cn } from 'heroui-native';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSheetIOS, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  Icon,
  LargeTitle,
  ScreenHeader,
  Text,
  useHeaderInset,
  View,
} from '@/components/ui';
import { getRepos } from '@/db/client';
import type { PresetRow } from '@/db/types';
import { BUILT_IN_PRESETS } from '@/features/prompts/built-in-presets';

export default function PromptsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const headerInset = useHeaderInset();
  const [presets, setPresets] = useState<PresetRow[]>([]);

  const load = useCallback(() => {
    getRepos()
      .presets.list()
      .then(setPresets)
      .catch(() => undefined);
  }, []);

  // Reload when the edit sheet closes.
  useFocusEffect(load);

  const makeDefault = async (preset: PresetRow) => {
    void Haptics.selectionAsync();
    await getRepos().presets.setDefault(preset.id);
    load();
  };

  const showOptions = (preset: PresetRow) => {
    const options = [
      t('prompts.edit'),
      preset.builtIn ? t('prompts.reset') : t('common.delete'),
      t('common.cancel'),
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: t('prompts.options', { name: preset.name }),
        options,
        destructiveButtonIndex: preset.builtIn ? undefined : 1,
        cancelButtonIndex: 2,
      },
      async (index) => {
        if (index === 0) {
          router.push({
            pathname: '/prompt-edit',
            params: { id: String(preset.id) },
          });
        } else if (index === 1) {
          if (preset.builtIn)
            await getRepos().presets.resetBuiltIn(preset.id, BUILT_IN_PRESETS);
          else await getRepos().presets.remove(preset.id);
          load();
        }
      }
    );
  };

  return (
    <View className="flex-1 bg-background" testID="prompts-screen">
      <ScrollView
        contentContainerClassName="px-4"
        contentContainerStyle={{
          paddingTop: headerInset + 4,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <LargeTitle className="mx-1">{t('prompts.title')}</LargeTitle>
        <Text className="mx-1 mt-2 text-[15px] leading-[22px] text-muted">
          {t('prompts.intro')}
        </Text>
        <View accessibilityRole="radiogroup" className="mt-5 gap-3">
          {presets.map((preset) => {
            const checked = preset.isDefault === 1;
            return (
              <Pressable
                key={preset.id}
                testID={`prompt-${preset.id}`}
                accessibilityRole="radio"
                accessibilityState={{ checked }}
                accessibilityHint={t('prompts.make_default')}
                onPress={() => void makeDefault(preset)}
                onLongPress={() => showOptions(preset)}
                className={cn(
                  'flex-row items-start gap-3 rounded-[22px] bg-surface p-4',
                  checked
                    ? 'border-2 border-accent-text'
                    : 'border border-border'
                )}
              >
                <View className="flex-1 gap-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="text-[17px] font-semibold text-foreground">
                      {preset.name}
                    </Text>
                    {checked ? (
                      <View className="rounded-lg bg-accent-tint px-1.5 py-0.5">
                        <Text className="text-[11px] font-bold text-accent-text">
                          {t('prompts.default_badge')}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    numberOfLines={3}
                    className="text-[14px] leading-[20px] text-muted"
                  >
                    {preset.content}
                  </Text>
                </View>
                <Pressable
                  testID={`prompt-options-${preset.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('prompts.options', {
                    name: preset.name,
                  })}
                  onPress={() => showOptions(preset)}
                  hitSlop={8}
                  className="size-11 items-center justify-center"
                >
                  <Icon
                    name="ellipsis-horizontal-circle-outline"
                    size={24}
                    className="text-muted"
                  />
                </Pressable>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <ScreenHeader
        left={
          <GlassIconButton
            testID="prompts-back"
            icon="chevron-back"
            accessibilityLabel={t('common.back')}
            onPress={() => router.navigate('/settings')}
          />
        }
        right={
          <GlassIconButton
            testID="prompts-add"
            icon="add"
            accessibilityLabel={t('prompts.add')}
            onPress={() => router.push('/prompt-edit')}
          />
        }
      />
    </View>
  );
}
