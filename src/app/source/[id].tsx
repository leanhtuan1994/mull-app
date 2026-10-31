import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, Icon, Text, View } from '@/components/ui';
import { getRepos } from '@/db/client';
import type { SourceChunk } from '@/db/repos';
import { chat } from '@/features/services';

type Loaded =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'ready'; chunk: SourceChunk };

/** The original passage behind a citation, from the chat on screen only. */
export default function SourceSheet() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    let alive = true;
    void getRepos()
      .chunks.getSource(Number(id))
      .then((chunk) => {
        if (!alive) return;
        // A link can only open passages of the chat it was shown in.
        const openChat = chat.store.getState().chat?.id;
        setLoaded(
          chunk && chunk.chatId === openChat
            ? { state: 'ready', chunk }
            : { state: 'missing' }
        );
      });
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <View className="flex-1 bg-background" testID="source-sheet">
      <View className="flex-row items-center justify-between px-5 pt-5 pb-2">
        <Text
          accessibilityRole="header"
          className="text-[17px] font-semibold text-foreground"
        >
          {t('chat.sources.title')}
        </Text>
        <GlassIconButton
          icon="close"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
        />
      </View>
      {loaded.state === 'ready' ? (
        <ScrollView
          contentInsetAdjustmentBehavior="never"
          contentContainerClassName="gap-3 px-5"
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        >
          <View className="flex-row items-center gap-2">
            <Icon
              name="document-text-outline"
              size={18}
              className="text-accent-text"
            />
            <Text className="shrink text-[15px] font-semibold text-foreground">
              {loaded.chunk.name}
            </Text>
            {loaded.chunk.page ? (
              <Text className="text-[15px] text-muted">
                {t('chat.sources.page', { page: loaded.chunk.page })}
              </Text>
            ) : null}
          </View>
          <Text
            selectable
            className="text-[16px] leading-[24px] text-foreground"
          >
            {loaded.chunk.text}
          </Text>
        </ScrollView>
      ) : loaded.state === 'missing' ? (
        <Text className="px-5 text-[15px] text-muted">
          {t('chat.sources.missing')}
        </Text>
      ) : null}
    </View>
  );
}
