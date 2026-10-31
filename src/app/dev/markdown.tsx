import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView } from 'react-native';

import { MarkdownText } from '@/components/chat/markdown-text';
import { Text, View } from '@/components/ui';
import { markdownSampleTokens } from '@/features/chat/markdown-sample';

/** About 50 tokens per second, close to a small model on an iPhone GPU. */
const TOKEN_MS = 20;
const TOKENS = markdownSampleTokens();

/** Renders the markdown sample, complete or replayed token by token. */
export default function MarkdownDevScreen() {
  const { t } = useTranslation();
  const [shown, setShown] = useState(TOKENS.length);
  const streaming = shown < TOKENS.length;

  useEffect(() => {
    if (!streaming) return;
    const timer = setTimeout(() => setShown((n) => n + 1), TOKEN_MS);
    return () => clearTimeout(timer);
  }, [shown, streaming]);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen options={{ title: t('dev.markdown_title') }} />
      <ScrollView
        testID="dev-markdown"
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1 bg-background"
        contentContainerClassName="gap-4 p-5 pb-16"
      >
        <Pressable
          testID="dev-markdown-replay"
          accessibilityRole="button"
          onPress={() => setShown(0)}
          className="self-start rounded-full bg-fill px-4 py-2"
        >
          <Text className="text-[15px] font-semibold text-foreground">
            {t('dev.markdown_replay')}
          </Text>
        </Pressable>
        <View>
          <MarkdownText
            value={TOKENS.slice(0, shown).join('')}
            streaming={streaming}
          />
        </View>
      </ScrollView>
    </>
  );
}
