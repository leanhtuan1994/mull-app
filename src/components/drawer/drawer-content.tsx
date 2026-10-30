import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useDrawerStatus } from 'expo-router/drawer';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, View } from '@/components/ui';
import { MAX_FONT_SCALE } from '@/components/ui/text';
import { useChat, useModels } from '@/features/services';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

import { ChatList } from './chat-list';
import { StorageMeter } from './storage-meter';

export function DrawerContent({
  navigation,
}: {
  navigation: { closeDrawer: () => void };
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();
  const [query, setQuery] = useState('');
  const activeChatId = useChat((s) => s.chat?.id ?? null);
  const modelCount = useModels((s) => s.downloadedIds.length);
  const status = useDrawerStatus();
  const lastStatus = useRef(status);

  // A light tap when the sidebar settles fully open or closed.
  useEffect(() => {
    if (lastStatus.current !== status) void Haptics.selectionAsync();
    lastStatus.current = status;
  }, [status]);

  const go = (href: Parameters<typeof router.navigate>[0]) => {
    navigation.closeDrawer();
    router.navigate(href);
  };

  return (
    <View
      testID="drawer"
      className="flex-1 bg-drawer pr-3 pl-4"
      style={{ paddingTop: insets.top + 4, paddingBottom: insets.bottom + 8 }}
    >
      <View className="h-12 flex-row items-center gap-2">
        <View className="h-10 flex-1 flex-row items-center gap-2 rounded-full bg-fill px-3">
          <Icon name="search" size={17} className="text-muted" />
          <TextInput
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            testID="drawer-search"
            accessibilityLabel={t('drawer.search')}
            placeholder={t('drawer.search')}
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            className="flex-1 text-[16px] text-foreground"
          />
        </View>
        <Pressable
          testID="drawer-new-chat"
          accessibilityRole="button"
          accessibilityLabel={t('chat.new_chat')}
          onPress={() =>
            go({ pathname: '/', params: { new: String(Date.now()) } })
          }
          className="size-11 items-center justify-center rounded-full bg-accent active:scale-[0.94]"
        >
          <Icon
            name="create-outline"
            size={20}
            className="text-accent-foreground"
          />
        </Pressable>
      </View>

      <View accessibilityRole="menu" className="mt-3.5">
        <DrawerLink
          testID="drawer-models"
          icon="cube-outline"
          label={t('drawer.models')}
          detail={
            modelCount
              ? t('drawer.models_on_device', { count: modelCount })
              : undefined
          }
          onPress={() => go('/models')}
        />
        <DrawerLink
          testID="drawer-settings"
          icon="options-outline"
          label={t('drawer.settings')}
          onPress={() => go('/settings')}
        />
      </View>

      <ChatList
        query={query}
        activeChatId={activeChatId}
        onOpen={(id) =>
          go({ pathname: '/chat/[id]', params: { id: String(id) } })
        }
        onDeletedActive={() =>
          go({ pathname: '/', params: { new: String(Date.now()) } })
        }
      />

      <StorageMeter onPress={() => go('/settings/storage')} />
    </View>
  );
}

function DrawerLink({
  icon,
  label,
  detail,
  onPress,
  testID,
}: {
  icon: 'cube-outline' | 'options-outline';
  label: string;
  detail?: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="menuitem"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={onPress}
      className="min-h-[46px] flex-row items-center gap-3 rounded-[14px] px-2.5 active:bg-fill"
    >
      <Icon name={icon} size={22} />
      <Text className="flex-1 text-[17px] text-foreground">{label}</Text>
      {detail ? <Text className="text-[13px] text-muted">{detail}</Text> : null}
    </Pressable>
  );
}
