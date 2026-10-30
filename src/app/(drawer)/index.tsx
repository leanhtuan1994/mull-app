import { useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { ChatScreen } from '@/components/chat/chat-screen';
import { chat } from '@/features/services';

/** A new chat. `new` forces a fresh one; `modelId` picks its model. */
export default function NewChatScreen() {
  const { modelId, new: fresh } = useLocalSearchParams<{
    modelId?: string;
    new?: string;
  }>();

  useEffect(() => {
    chat.startNew(modelId ?? null);
  }, [modelId, fresh]);

  return <ChatScreen />;
}
