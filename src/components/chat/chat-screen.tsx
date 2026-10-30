import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import type { DrawerNavigationProp } from 'expo-router/drawer';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, type TextInputInstance } from 'react-native';
import {
  useKeyboardState,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { DrawerScene } from '@/components/drawer/drawer-scene';
import {
  GlassIconButton,
  Icon,
  List,
  ScreenHeader,
  Text,
  useHeaderInset,
  View,
} from '@/components/ui';
import type { UiMessage } from '@/features/chat/chat-store';
import { useActiveModel } from '@/features/chat/use-active-model';
import { chat, useChat, useLlm, useModels } from '@/features/services';

import { AssistantMessage } from './assistant-message';
import {
  ContextTrimNote,
  LoadErrorCard,
  LoadingModelRow,
  NoModelCard,
} from './chat-notices';
import { canSendDraft, Composer } from './composer';
import { EmptyChatGreeting, SuggestionGrid } from './empty-chat';
import { UserBubble } from './user-bubble';

/** A one-line composer, so the first frame already leaves room for it. */
const COMPOSER_HEIGHT = 106;

type Row =
  | { type: 'message'; key: string; message: UiMessage; isLast: boolean }
  | { type: 'streaming'; key: string; text: string; modelName: string }
  | { type: 'loading'; key: string }
  | { type: 'trimmed'; key: string }
  | { type: 'error'; key: string; kind: 'load' | 'memory' };

export function ChatScreen() {
  const { t } = useTranslation();
  const navigation =
    useNavigation<DrawerNavigationProp<Record<string, undefined>>>();
  const insets = useSafeAreaInsets();
  const headerInset = useHeaderInset();
  const [draft, setDraft] = useState('');
  const [template, setTemplate] = useState<string | null>(null);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_HEIGHT);
  const inputRef = useRef<TextInputInstance>(null);
  const background = String(useCSSVariable('--color-background') ?? '#F5F1EA');

  const messages = useChat((s) => s.messages);
  const streaming = useChat((s) => s.streaming);
  const trimmed = useChat((s) => s.trimmed);
  const chatError = useChat((s) => s.error);
  const chatTitle = useChat((s) => s.chat?.title ?? null);
  const llmStatus = useLlm((s) => s.status);
  const llmError = useLlm((s) => s.error);
  const hasAnyModel = useModels((s) => s.downloadedIds.length > 0);
  const model = useActiveModel();

  const generating = streaming !== null || llmStatus === 'generating';
  const errorKind: 'load' | 'memory' | null =
    llmError?.kind === 'memory'
      ? 'memory'
      : chatError === 'load'
        ? 'load'
        : null;
  const isEmpty = messages.length === 0 && !streaming;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const lastUserIndex = messages.findLastIndex((m) => m.role === 'user');
    messages.forEach((message, index) => {
      if (trimmed && index === lastUserIndex)
        out.push({ type: 'trimmed', key: 'trimmed' });
      if (streaming?.replacesId === message.id) return;
      out.push({
        type: 'message',
        key: `m-${message.id}`,
        message,
        isLast: index === messages.length - 1,
      });
    });
    if (streaming) {
      if (!streaming.text && llmStatus === 'loading')
        out.push({ type: 'loading', key: 'loading' });
      else
        out.push({
          type: 'streaming',
          key: 'streaming',
          text: streaming.text,
          modelName: streaming.modelName || model?.name || '',
        });
    }
    if (errorKind) out.push({ type: 'error', key: 'error', kind: errorKind });
    return out;
  }, [messages, streaming, trimmed, llmStatus, errorKind, model?.name]);

  const send = async () => {
    const text = draft;
    if (!canSendDraft(text, template)) return;
    setDraft('');
    setTemplate(null);
    const id = await chat.send(text);
    if (id === null) setDraft(text);
  };

  const pickSuggestion = (prompt: string, needsInput: boolean) => {
    setDraft(prompt);
    setTemplate(needsInput ? prompt : null);
    if (needsInput) inputRef.current?.focus();
  };

  // The composer floats over the messages so they scroll under its glass.
  // The list's frame ends at the keyboard; the extra padding keeps the last
  // message clear of the composer whether the keyboard is up or not.
  const restingBottom = insets.bottom + 4;
  const keyboard = useReanimatedKeyboardAnimation();
  const bottomStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(restingBottom, -keyboard.height.value + 8),
  }));
  const listFrameStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, -keyboard.height.value + 8 - restingBottom),
  }));
  const contentBottom = composerHeight + 8 + restingBottom;
  // Starters make way once the user is typing; with the keyboard up they
  // would cover the greeting.
  const keyboardVisible = useKeyboardState((state) => state.isVisible);
  const showSuggestions = isEmpty && hasAnyModel && !draft && !keyboardVisible;

  const openPicker = () => router.push('/model-picker');
  const newChat = () =>
    router.navigate({ pathname: '/', params: { new: String(Date.now()) } });

  return (
    <DrawerScene>
      <View className="flex-1 bg-background" testID="chat-screen">
        <Animated.View className="flex-1" style={listFrameStyle}>
          {isEmpty ? (
            <ScrollView
              className="flex-1"
              contentContainerClassName="grow justify-center"
              contentContainerStyle={{
                paddingTop: headerInset,
                paddingBottom: contentBottom + 16,
              }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
            >
              {hasAnyModel ? (
                <EmptyChatGreeting modelName={model?.name ?? null} />
              ) : (
                <View className="px-4">
                  <NoModelCard
                    onOpenLibrary={() => router.navigate('/models')}
                  />
                </View>
              )}
            </ScrollView>
          ) : (
            <List
              testID="message-list"
              data={rows}
              keyExtractor={(row) => row.key}
              getItemType={(row) =>
                row.type === 'message' ? row.message.role : row.type
              }
              maintainVisibleContentPosition={{
                startRenderingFromBottom: true,
                autoscrollToBottomThreshold: 0.2,
              }}
              keyboardDismissMode="on-drag"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingTop: headerInset + 8,
                paddingBottom: contentBottom + 8,
              }}
              scrollIndicatorInsets={{ bottom: contentBottom - insets.bottom }}
              ListHeaderComponent={
                <View className="mb-5 flex-row items-center justify-center gap-1.5 px-5">
                  <Icon
                    name="lock-closed-outline"
                    size={13}
                    className="text-muted"
                  />
                  <Text className="text-[13px] text-muted">
                    {t('chat.private_note')}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <View className="px-5 pb-[22px]">
                  <ChatRow
                    row={item}
                    generating={generating}
                    onSwitchModel={() => {
                      chat.clearError();
                      openPicker();
                    }}
                  />
                </View>
              )}
            />
          )}
        </Animated.View>

        <Animated.View
          pointerEvents="box-none"
          className="absolute inset-x-0 bottom-0 px-3 pt-2"
          style={bottomStyle}
        >
          <LinearGradient
            pointerEvents="none"
            colors={[`${background}00`, background]}
            locations={[0, 0.8]}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: restingBottom + 24,
            }}
          />
          <View
            pointerEvents="box-none"
            className="gap-3"
            onLayout={(e) => setComposerHeight(e.nativeEvent.layout.height)}
          >
            {showSuggestions ? (
              <SuggestionGrid onPick={pickSuggestion} />
            ) : null}
            {chatError === 'generate' ? (
              <Text
                accessibilityRole="alert"
                className="px-3 text-[13px] text-danger"
              >
                {t('chat.errors.generate')}
              </Text>
            ) : null}
            <Composer
              ref={inputRef}
              value={draft}
              onChangeText={(text) => {
                setDraft(text);
                if (!text.trim()) setTemplate(null);
              }}
              onSend={() => void send()}
              onStop={() => void chat.stop()}
              onStartTyping={() => chat.prepare()}
              generating={generating}
              disabled={!model}
              template={template}
              model={model}
              onPickModel={openPicker}
              placeholder={
                model
                  ? t('chat.composer.placeholder', { model: model.name })
                  : t('chat.composer.placeholder_no_model')
              }
            />
          </View>
        </Animated.View>

        <ScreenHeader
          left={
            <GlassIconButton
              testID="open-drawer"
              icon="menu"
              accessibilityLabel={t('chat.open_drawer')}
              onPress={() => navigation.openDrawer()}
            />
          }
          center={
            chatTitle ? (
              <Text
                numberOfLines={1}
                className="text-[16px] font-semibold text-foreground"
              >
                {chatTitle}
              </Text>
            ) : null
          }
          right={
            chatTitle !== null ? (
              <GlassIconButton
                testID="new-chat"
                icon="create-outline"
                accessibilityLabel={t('chat.new_chat')}
                onPress={newChat}
              />
            ) : null
          }
        />
      </View>
    </DrawerScene>
  );
}

function ChatRow({
  row,
  generating: busy,
  onSwitchModel,
}: {
  row: Row;
  generating: boolean;
  onSwitchModel: () => void;
}) {
  switch (row.type) {
    case 'message':
      return row.message.role === 'user' ? (
        <UserBubble content={row.message.content} />
      ) : (
        <AssistantMessage
          content={row.message.content}
          modelName={row.message.modelName}
          stopped={row.message.stoppedByUser}
          tokensPerSecond={row.message.tokensPerSecond}
          tokenCount={row.message.tokenCount}
          onRegenerate={
            row.isLast && !busy ? () => void chat.regenerate() : undefined
          }
        />
      );
    case 'streaming':
      return (
        <AssistantMessage
          content={row.text}
          modelName={row.modelName}
          streaming
        />
      );
    case 'loading':
      return <LoadingModelRow />;
    case 'trimmed':
      return <ContextTrimNote />;
    case 'error':
      return <LoadErrorCard kind={row.kind} onSwitchModel={onSwitchModel} />;
  }
}
