import { useEffect, useState } from 'react';

import { getRepos } from '@/db/client';
import type { ChatRow, ChatSearchRow } from '@/db/types';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

import { useChatListVersion } from './chat-list-store';

/** All chats, or those matching `query` (accent-insensitive), newest first. */
export function useChatList(query: string) {
  const debounced = useDebouncedValue(query, 150);
  const version = useChatListVersion((s) => s.version);
  const [chats, setChats] = useState<(ChatRow | ChatSearchRow)[]>([]);

  useEffect(() => {
    let alive = true;
    const repos = getRepos();
    const load = debounced.trim()
      ? repos.chats.search(debounced)
      : repos.chats.list();
    load
      .then((rows) => {
        if (alive) setChats(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [debounced, version]);

  return { chats, query: debounced };
}
