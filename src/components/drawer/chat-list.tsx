import { cn } from 'heroui-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSheetIOS, Alert, Pressable } from 'react-native';

import { List, Text, View } from '@/components/ui';
import { getRepos } from '@/db/client';
import type { ChatRow, ChatSearchRow } from '@/db/types';
import { notifyChatsChanged } from '@/features/chat/chat-list-store';
import { type DateGroupKey, groupByDate } from '@/features/chat/group-by-date';
import { searchExcerpt } from '@/features/chat/search-excerpt';
import { useChatList } from '@/features/chat/use-chat-list';
import { deleteChat } from '@/features/services';

type Item =
  | { type: 'header'; key: string; label: string }
  | { type: 'chat'; key: string; chat: ChatRow | ChatSearchRow };

function useGroupLabel() {
  const { t, i18n } = useTranslation();
  return (group: DateGroupKey) => {
    if (group.kind !== 'month') return t(`drawer.groups.${group.kind}`);
    const label = new Date(group.year, group.month, 1).toLocaleDateString(
      i18n.language,
      {
        month: 'long',
        year: 'numeric',
      }
    );
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
}

export function ChatList({
  query,
  activeChatId,
  onOpen,
  onDeletedActive,
}: {
  query: string;
  activeChatId: number | null;
  onOpen: (id: number) => void;
  onDeletedActive: () => void;
}) {
  const { t } = useTranslation();
  const { chats, query: searched } = useChatList(query);
  const labelOf = useGroupLabel();

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const group of groupByDate(chats, (c) => c.lastUsed)) {
      out.push({
        type: 'header',
        key: `h-${group.key}`,
        label: labelOf(group.group),
      });
      for (const chat of group.items)
        out.push({ type: 'chat', key: `c-${chat.id}`, chat });
    }
    return out;
  }, [chats, labelOf]);

  const showMenu = (chat: ChatRow) => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: chat.title,
        options: [t('common.rename'), t('common.delete'), t('common.cancel')],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      (index) => {
        if (index === 0) rename(chat);
        if (index === 1) confirmDelete(chat);
      }
    );
  };

  const rename = (chat: ChatRow) => {
    Alert.prompt(
      t('drawer.rename_title'),
      undefined,
      async (title) => {
        const next = title?.trim();
        if (!next) return;
        await getRepos().chats.rename(chat.id, next.slice(0, 80));
        notifyChatsChanged();
      },
      'plain-text',
      chat.title
    );
  };

  const confirmDelete = (chat: ChatRow) => {
    Alert.alert(t('drawer.confirm_delete', { title: chat.title }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteChat(chat.id);
          notifyChatsChanged();
          if (chat.id === activeChatId) onDeletedActive();
        },
      },
    ]);
  };

  return (
    <View className="mt-2.5 flex-1">
      <List
        testID="drawer-chat-list"
        data={items}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text className="mx-2.5 my-4 text-[15px] leading-[22px] text-muted">
            {query.trim()
              ? t('drawer.no_results', { query: query.trim() })
              : t('drawer.no_chats')}
          </Text>
        }
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text
              accessibilityRole="header"
              className="px-2.5 pt-3.5 pb-1.5 text-[13px] font-semibold text-muted"
            >
              {item.label}
            </Text>
          ) : (
            <Pressable
              testID={`drawer-chat-${item.chat.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: item.chat.id === activeChatId }}
              accessibilityHint={t('drawer.rename_title')}
              onPress={() => onOpen(item.chat.id)}
              onLongPress={() => showMenu(item.chat)}
              delayLongPress={350}
              className={cn(
                'min-h-[42px] justify-center rounded-[14px] px-2.5 active:bg-fill',
                item.chat.id === activeChatId && 'bg-accent-tint',
                'matchText' in item.chat && item.chat.matchText && 'py-2'
              )}
            >
              <Text
                numberOfLines={1}
                className={cn(
                  'text-[16px] text-foreground',
                  item.chat.id === activeChatId && 'font-semibold'
                )}
              >
                {item.chat.title}
              </Text>
              {'matchText' in item.chat && item.chat.matchText ? (
                <MatchPreview text={item.chat.matchText} query={searched} />
              ) : null}
            </Pressable>
          )
        }
      />
    </View>
  );
}

/** Why a chat matched: the message text around the search words. */
function MatchPreview({ text, query }: { text: string; query: string }) {
  const excerpt = searchExcerpt(text, query);
  if (!excerpt) return null;
  return (
    <Text
      testID="drawer-chat-match"
      numberOfLines={2}
      className="mt-0.5 text-[13px] leading-[18px] text-muted"
    >
      {excerpt.before}
      <Text className="font-semibold text-foreground">{excerpt.match}</Text>
      {excerpt.after}
    </Text>
  );
}
