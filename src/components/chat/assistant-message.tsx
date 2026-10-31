import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useToast } from 'heroui-native';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Share } from 'react-native';

import {
  Icon,
  type IconName,
  ModelMonogram,
  Text,
  View,
} from '@/components/ui';
import type { MessageSource } from '@/db/types';
import { getCatalogModels } from '@/features/models/catalog';
import { formatInteger } from '@/lib/format';

import { MarkdownText } from './markdown-text';
import { SourceChips } from './source-chips';

type AssistantMessageProps = {
  content: string;
  modelName: string | null;
  streaming?: boolean;
  stopped?: boolean;
  tokensPerSecond?: number | null;
  tokenCount?: number | null;
  /** Only the latest answer can be regenerated. */
  onRegenerate?: () => void;
  /** Document passages this answer was given. */
  sources?: MessageSource[];
};

const EMPTY_SOURCES: MessageSource[] = [];

function familyOf(modelName: string | null) {
  return getCatalogModels().find((m) => m.name === modelName)?.family ?? 'qwen';
}

export const AssistantMessage = memo(function AssistantMessage({
  content,
  modelName,
  streaming,
  stopped,
  tokensPerSecond,
  tokenCount,
  onRegenerate,
  sources = EMPTY_SOURCES,
}: AssistantMessageProps) {
  const { t } = useTranslation();
  const citations = useMemo(
    () => new Map(sources.map((s) => [s.n, s.chunkId])),
    [sources]
  );
  const { toast } = useToast();

  const copy = async () => {
    await Clipboard.setStringAsync(content);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toast.show({ label: t('chat.actions.copied') });
  };

  const metrics =
    tokensPerSecond && tokenCount
      ? t('chat.metrics', {
          tps: formatInteger(tokensPerSecond),
          tokens: formatInteger(tokenCount),
        })
      : tokenCount
        ? t('chat.metrics_tokens', { tokens: formatInteger(tokenCount) })
        : null;

  return (
    <View testID="assistant-message" className="gap-2">
      {modelName ? (
        <View
          className="flex-row items-center gap-2"
          accessible
          accessibilityRole="header"
        >
          <ModelMonogram
            name={modelName}
            family={familyOf(modelName)}
            size={22}
          />
          <Text className="text-[13px] font-semibold text-muted">
            {modelName}
          </Text>
        </View>
      ) : null}

      {content ? (
        <View testID={streaming ? 'assistant-streaming' : undefined}>
          <MarkdownText
            value={content}
            streaming={streaming}
            citations={citations}
          />
        </View>
      ) : streaming ? (
        <Text className="text-[17px] text-accent-text">▍</Text>
      ) : null}

      {!streaming ? <SourceChips sources={sources} answer={content} /> : null}

      {stopped ? (
        <View
          className="self-start rounded-lg bg-fill px-2 py-0.5"
          testID="stopped-badge"
        >
          <Text className="text-[12px] font-semibold text-muted">
            {t('chat.stopped')}
          </Text>
        </View>
      ) : null}

      {!streaming ? (
        <View className="-ml-2 flex-row items-center gap-1">
          <ActionButton
            icon="copy-outline"
            label={t('chat.actions.copy')}
            onPress={copy}
          />
          {onRegenerate ? (
            <ActionButton
              icon="refresh-outline"
              label={t('chat.actions.regenerate')}
              onPress={onRegenerate}
            />
          ) : null}
          <ActionButton
            icon="share-outline"
            label={t('chat.actions.share')}
            onPress={() => void Share.share({ message: content })}
          />
          {metrics ? (
            <Text
              className="ml-1.5 text-[12px] text-muted"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {metrics}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

function ActionButton({
  icon,
  label,
  onPress,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      className="size-9 items-center justify-center rounded-full active:bg-fill"
    >
      <Icon name={icon} size={18} className="text-muted" />
    </Pressable>
  );
}
