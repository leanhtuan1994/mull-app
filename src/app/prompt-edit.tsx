import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, TextInput } from 'react-native';

import { Text, View } from '@/components/ui';
import { MAX_FONT_SCALE } from '@/components/ui/text';
import { getRepos } from '@/db/client';
import { estimateTokens } from '@/features/chat/token-estimate';
import {
  PRESET_CONTENT_MAX,
  PRESET_NAME_MAX,
} from '@/features/prompts/built-in-presets';
import {
  type PresetErrors,
  validatePreset,
} from '@/features/prompts/preset-schema';
import { formatInteger } from '@/lib/format';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

/** Add a preset, or edit one with `id`. */
export default function PromptEditSheet() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const presetId = id ? Number(id) : null;
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [errors, setErrors] = useState<PresetErrors>({});

  useEffect(() => {
    if (presetId === null) return;
    void getRepos()
      .presets.get(presetId)
      .then((preset) => {
        if (!preset) return;
        setName(preset.name);
        setContent(preset.content);
      });
  }, [presetId]);

  const save = async () => {
    const { data, errors: next } = validatePreset({ name, content });
    setErrors(next);
    if (!data) return;
    const repos = getRepos();
    if (presetId === null) await repos.presets.create(data);
    else await repos.presets.update(presetId, data);
    router.back();
  };

  const errorText = (key?: string) =>
    key
      ? t(`prompts.errors.${key}`, {
          max: key.startsWith('name') ? PRESET_NAME_MAX : PRESET_CONTENT_MAX,
        })
      : null;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-4 pt-3 pb-10"
      keyboardShouldPersistTaps="handled"
    >
      <View className="h-[52px] flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          className="min-h-11 w-16 justify-center"
        >
          <Text className="text-[17px] text-accent-text">
            {t('common.cancel')}
          </Text>
        </Pressable>
        <Text
          accessibilityRole="header"
          className="text-[17px] font-semibold text-foreground"
        >
          {presetId === null ? t('prompts.new_title') : t('prompts.edit_title')}
        </Text>
        <Pressable
          testID="prompt-save"
          accessibilityRole="button"
          onPress={() => void save()}
          className="min-h-11 w-16 items-end justify-center"
        >
          <Text className="text-[17px] font-semibold text-accent-text">
            {t('common.save')}
          </Text>
        </Pressable>
      </View>

      <View className="mt-3 gap-1.5">
        <Text className="px-4 text-[13px] text-muted">{t('prompts.name')}</Text>
        <TextInput
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          testID="prompt-name"
          accessibilityLabel={t('prompts.name')}
          value={name}
          onChangeText={setName}
          maxLength={PRESET_NAME_MAX}
          placeholder={t('prompts.name_placeholder')}
          placeholderTextColor={colors.muted}
          className="min-h-[52px] rounded-[22px] bg-surface px-4 text-[17px] text-foreground"
        />
        {errors.name ? (
          <Text
            accessibilityRole="alert"
            className="px-4 text-[13px] text-danger"
          >
            {errorText(errors.name)}
          </Text>
        ) : null}
      </View>

      <View className="mt-5 gap-1.5">
        <Text className="px-4 text-[13px] text-muted">
          {t('prompts.content')}
        </Text>
        <TextInput
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          testID="prompt-content"
          accessibilityLabel={t('prompts.content')}
          value={content}
          onChangeText={setContent}
          maxLength={PRESET_CONTENT_MAX}
          placeholder={t('prompts.content_placeholder')}
          placeholderTextColor={colors.muted}
          multiline
          textAlignVertical="top"
          className="min-h-40 rounded-[22px] bg-surface px-4 pt-3.5 pb-3.5 text-[17px] leading-[24px] text-foreground"
        />
        <Text
          testID="prompt-token-estimate"
          className="px-4 text-[13px] text-muted"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {t('prompts.token_estimate', {
            tokens: formatInteger(estimateTokens(content)),
            chars: formatInteger(Array.from(content).length),
            max: formatInteger(PRESET_CONTENT_MAX),
          })}
        </Text>
        {errors.content ? (
          <Text
            accessibilityRole="alert"
            className="px-4 text-[13px] text-danger"
          >
            {errorText(errors.content)}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
