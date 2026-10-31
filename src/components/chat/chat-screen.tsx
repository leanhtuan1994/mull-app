import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useNavigation } from 'expo-router';
import type { DrawerNavigationProp } from 'expo-router/drawer';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionSheetIOS,
  Alert,
  ScrollView,
  type TextInputInstance,
} from 'react-native';
import {
  KeyboardEvents,
  useKeyboardState,
  useReanimatedKeyboardAnimation,
} from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { DrawerScene } from '@/components/drawer/drawer-scene';
import { ModelDownloadButton } from '@/components/models/model-download-button';
import {
  GlassIconButton,
  Icon,
  ScreenHeader,
  Text,
  useHeaderInset,
  View,
} from '@/components/ui';
import type { AttachmentRow } from '@/db/types';
import { DocumentTooLargeError } from '@/features/attachments/attachment-files';
import { pickFiles } from '@/features/attachments/pick';
import type { UiMessage } from '@/features/chat/chat-store';
import { useActiveModel } from '@/features/chat/use-active-model';
import { getCatalogModels } from '@/features/models/catalog';
import {
  attachments,
  chat,
  ingest,
  useChat,
  useLlm,
  useModels,
} from '@/features/services';

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
import { VisionModelCard } from './vision-model-card';

const MAX_DOCUMENTS = 3;

/** Images cost hundreds of tokens each, so smaller contexts take fewer. */
function maxImages(contextTokens = 0) {
  return contextTokens >= 8192 ? 4 : 2;
}

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
  const [drafts, setDrafts] = useState<AttachmentRow[]>([]);
  const [composerHeight, setComposerHeight] = useState(COMPOSER_HEIGHT);
  const inputRef = useRef<TextInputInstance>(null);
  const listRef = useRef<LegendListRef>(null);
  const background = String(useCSSVariable('--color-background') ?? '#F5F1EA');

  const messages = useChat((s) => s.messages);
  const streaming = useChat((s) => s.streaming);
  const trimmed = useChat((s) => s.trimmed);
  const chatError = useChat((s) => s.error);
  const chatTitle = useChat((s) => s.chat?.title ?? null);
  const chatId = useChat((s) => s.chat?.id ?? null);
  const documentsUnindexed = useChat((s) => s.documentsUnindexed);
  const downloadedIds = useModels((s) => s.downloadedIds);
  // Long documents were searched by keywords: offer the embedding model.
  const embedderOffer = documentsUnindexed
    ? getCatalogModels().find(
        (m) => m.kind === 'embedding' && !downloadedIds.includes(m.id)
      )
    : undefined;
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

  // Images need a model that reads them; offer one instead of sending.
  const needsVision =
    drafts.some((d) => d.kind === 'image') && !!model && !model.vision;

  const send = async () => {
    const files = drafts;
    if (needsVision) return;
    if (!canSendDraft(draft, template) && files.length === 0) return;
    // Attachments alone get a prompt that says what to do with them.
    const text =
      draft.trim() ||
      (files.some((f) => f.kind === 'image')
        ? t('chat.attachments.image_prompt')
        : t('chat.attachments.document_prompt'));
    setDraft('');
    setTemplate(null);
    setDrafts([]);
    listRef.current?.scrollToEnd({ animated: true });
    // Put the draft back if sending failed, so nothing is lost.
    const id = await chat
      .send(
        text,
        files.map((f) => f.id)
      )
      .catch(() => null);
    if (id === null) {
      setDraft(draft);
      setDrafts(files);
    }
  };

  const addAttachments = () => {
    const images = drafts.filter((d) => d.kind === 'image').length;
    const documents = drafts.length - images;
    const imageLimit = maxImages(model?.contextTokens);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [
          t('chat.attachments.library'),
          t('chat.attachments.camera'),
          t('chat.attachments.document'),
          t('common.cancel'),
        ],
        cancelButtonIndex: 3,
      },
      (index) => {
        const source = (['library', 'camera', 'document'] as const)[index];
        if (!source) return;
        const room =
          source === 'document'
            ? MAX_DOCUMENTS - documents
            : imageLimit - images;
        if (room <= 0) {
          Alert.alert(
            source === 'document'
              ? t('chat.attachments.too_many_documents', {
                  count: MAX_DOCUMENTS,
                })
              : t('chat.attachments.too_many_images', { count: imageLimit })
          );
          return;
        }
        void (async () => {
          for (const file of await pickFiles(source, room)) {
            try {
              // Images can come from Files too; they are stored as images.
              const row = file.mime.startsWith('image/')
                ? await attachments.addImage(file.uri, file.name)
                : await attachments.addDocument(file.uri, file.name, file.mime);
              if (row.kind === 'document') ingest.start(row.id);
              setDrafts((current) => [...current, row]);
            } catch (error) {
              Alert.alert(
                error instanceof DocumentTooLargeError
                  ? t('chat.attachments.too_large')
                  : t('chat.attachments.failed')
              );
            }
          }
        })();
      }
    );
  };

  const removeDraft = (id: number) => {
    setDrafts((current) => current.filter((d) => d.id !== id));
    void attachments.discardDraft(id);
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
  const showSuggestions =
    isEmpty && hasAnyModel && !draft && drafts.length === 0 && !keyboardVisible;

  // Leaving a chat discards attachments picked but not sent there.
  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);
  useEffect(() => {
    return () => {
      for (const d of draftsRef.current) void attachments.discardDraft(d.id);
      draftsRef.current = [];
    };
  }, [chatId]);

  // The keyboard shrinks the list from below, which can push the newest
  // message out of reach of maintainScrollAtEnd's threshold. Keep following
  // the end when the reader was already there.
  useEffect(() => {
    let followEnd = false;
    const start = () => {
      followEnd =
        listRef.current?.getState().isWithinMaintainScrollAtEndThreshold ??
        false;
    };
    const settle = () => {
      if (followEnd) listRef.current?.scrollToEnd({ animated: true });
    };
    const subscriptions = [
      KeyboardEvents.addListener('keyboardWillShow', start),
      KeyboardEvents.addListener('keyboardWillHide', start),
      KeyboardEvents.addListener('keyboardDidShow', settle),
      KeyboardEvents.addListener('keyboardDidHide', settle),
    ];
    return () => subscriptions.forEach((s) => s.remove());
  }, []);

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
            <LegendList
              ref={listRef}
              testID="message-list"
              data={rows}
              keyExtractor={(row) => row.key}
              getItemType={(row) =>
                row.type === 'message' ? row.message.role : row.type
              }
              estimatedItemSize={160}
              recycleItems={false}
              alignItemsAtEnd
              initialScrollAtEnd
              maintainScrollAtEnd
              maintainScrollAtEndThreshold={0.2}
              maintainVisibleContentPosition
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
            {needsVision && model ? (
              <VisionModelCard
                currentName={model.name}
                onUse={(id) => void chat.switchModel(id)}
              />
            ) : null}
            {embedderOffer ? (
              <View
                testID="embedder-offer"
                className="gap-2.5 rounded-[20px] bg-surface p-3.5"
              >
                <Text className="text-[14px] leading-[20px] text-foreground">
                  {t('chat.attachments.needs_embedder')}
                </Text>
                <ModelDownloadButton
                  model={embedderOffer}
                  onStartChat={() => {}}
                  testID="embedder-download"
                />
              </View>
            ) : null}
            {chatError === 'generate' || chatError === 'tooLong' ? (
              <Text
                accessibilityRole="alert"
                className="px-3 text-[13px] text-danger"
              >
                {chatError === 'tooLong'
                  ? t('chat.errors.too_long')
                  : t('chat.errors.generate')}
              </Text>
            ) : null}
            <Composer
              ref={inputRef}
              attachments={drafts.map((d) => ({
                id: d.id,
                kind: d.kind,
                name: d.name,
                thumbUri: d.thumbPath
                  ? `file://${attachments.absolute(d.thumbPath)}`
                  : undefined,
              }))}
              onAddAttachment={model ? addAttachments : undefined}
              onRemoveAttachment={removeDraft}
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
        <UserBubble
          content={row.message.content}
          attachments={row.message.attachments}
        />
      ) : (
        <AssistantMessage
          content={row.message.content}
          modelName={row.message.modelName}
          stopped={row.message.stoppedByUser}
          tokensPerSecond={row.message.tokensPerSecond}
          tokenCount={row.message.tokenCount}
          sources={row.message.sources}
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
