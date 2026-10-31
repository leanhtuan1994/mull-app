import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';

import { Icon, Text, View } from '@/components/ui';
import type { MessageSource } from '@/db/types';
import { citedNumbers } from '@/features/attachments/document-context';

/**
 * The passages an answer cited, as chips that open the original text. When
 * a small model forgot to cite, every passage it was given is listed as
 * "consulted" instead.
 */
export function SourceChips({
  sources,
  answer,
}: {
  sources: MessageSource[];
  answer: string;
}) {
  const { t } = useTranslation();
  if (sources.length === 0) return null;
  const cited = citedNumbers(answer)
    .map((n) => sources.find((s) => s.n === n))
    .filter((s) => s !== undefined);
  const shown = cited.length > 0 ? cited : sources;
  return (
    <View className="gap-1.5" testID="source-chips">
      <Text className="text-[12px] font-semibold text-muted">
        {cited.length > 0
          ? t('chat.sources.cited')
          : t('chat.sources.consulted')}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
      >
        {shown.map((source) => (
          <Pressable
            key={source.n}
            testID={`source-chip-${source.n}`}
            accessibilityRole="button"
            accessibilityLabel={t('chat.sources.open', {
              index: source.n,
              name: source.name,
            })}
            onPress={() => router.push(`/source/${source.chunkId}`)}
            className="h-8 max-w-[240px] flex-row items-center gap-1.5 rounded-full bg-fill px-3 active:opacity-70"
          >
            <Text className="text-[13px] font-semibold text-accent-text">
              {source.n}
            </Text>
            <Icon
              name="document-text-outline"
              size={13}
              className="text-muted"
            />
            <Text
              numberOfLines={1}
              className="shrink text-[13px] text-foreground"
            >
              {source.page
                ? t('chat.sources.name_page', {
                    name: source.name,
                    page: source.page,
                  })
                : source.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
