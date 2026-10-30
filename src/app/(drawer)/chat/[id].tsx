import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback } from 'react';

import { ChatScreen } from '@/components/chat/chat-screen';
import { chat } from '@/features/services';

export default function ChatByIdScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  // On focus, not mount: the drawer keeps this screen alive between chats.
  useFocusEffect(
    useCallback(() => {
      const chatId = Number(id);
      if (Number.isFinite(chatId)) void chat.open(chatId);
    }, [id])
  );

  return <ChatScreen />;
}
