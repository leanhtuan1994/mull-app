import { Redirect, router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Text, View } from '@/components/ui';
import { getRepos } from '@/db/client';
import { notifyChatsChanged } from '@/features/chat/chat-list-store';
import { MARKDOWN_SAMPLE } from '@/features/chat/markdown-sample';
import { DEFAULT_REPLY } from '@/features/llm/mock-engine';

const PAIRS = 100;
const SHORT_REPLY = 'Được, mình ghi nhận rồi. Bạn muốn làm gì tiếp theo?';
const REPLIES = [MARKDOWN_SAMPLE, DEFAULT_REPLY, SHORT_REPLY];

/**
 * Creates a 200-message chat mixing prose, code, tables and math, then opens
 * it. Used to measure scrolling.
 */
export default function SeedChatDevScreen() {
  const { t } = useTranslation();
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (!__DEV__) return;
    let alive = true;
    void (async () => {
      const repos = getRepos();
      const chatId = await repos.chats.create({
        title: t('dev.seed_chat_title'),
        modelId: null,
        systemPrompt: '',
      });
      for (let i = 0; i < PAIRS && alive; i++) {
        await repos.messages.add({
          chatId,
          role: 'user',
          content: `Câu hỏi số ${i + 1}: cho mình một ví dụ nhé?`,
        });
        await repos.messages.add({
          chatId,
          role: 'assistant',
          content: REPLIES[i % REPLIES.length],
          modelName: 'Qwen3 0.6B',
          tokenCount: 120,
          tokensPerSecond: 40,
        });
        setDone(i + 1);
      }
      if (!alive) return;
      notifyChatsChanged();
      router.replace(`/chat/${chatId}`);
    })();
    return () => {
      alive = false;
    };
  }, [t]);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen options={{ title: t('dev.seed_chat_title') }} />
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-[17px] text-foreground">
          {done * 2} / {PAIRS * 2}
        </Text>
      </View>
    </>
  );
}
