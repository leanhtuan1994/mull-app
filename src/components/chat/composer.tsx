import { Image } from 'expo-image';
import { cn } from 'heroui-native';
import { type Ref, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  TextInput,
  type TextInputInstance,
} from 'react-native';

import {
  GlassBackground,
  Icon,
  ModelMonogram,
  Text,
  View,
} from '@/components/ui';
import { MAX_FONT_SCALE } from '@/components/ui/text';
import type { CatalogModel } from '@/features/models/catalog-schema';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

type ComposerProps = {
  ref?: Ref<TextInputInstance>;
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onStop: () => void;
  generating: boolean;
  placeholder: string;
  disabled?: boolean;
  /** A suggestion the user still has to add to; sending it unchanged is blocked. */
  template?: string | null;
  model?: Pick<CatalogModel, 'name' | 'family'> | null;
  onPickModel?: () => void;
  /** First keystroke: a good moment to start loading the model. */
  onStartTyping?: () => void;
  /** Draft attachments shown above the field. */
  attachments?: ComposerAttachment[];
  onAddAttachment?: () => void;
  onRemoveAttachment?: (id: number) => void;
};

export type ComposerAttachment = {
  id: number;
  kind: 'image' | 'document';
  name: string;
  /** file:// URL of the thumbnail, for images. */
  thumbUri?: string;
};

/**
 * Floating Liquid Glass card: the message field on top, the model switcher
 * and the send button below it. Send turns into stop while answering.
 */
export function Composer({
  ref,
  value,
  onChangeText,
  onSend,
  onStop,
  generating,
  placeholder,
  disabled,
  template,
  model,
  onPickModel,
  onStartTyping,
  attachments = [],
  onAddAttachment,
  onRemoveAttachment,
}: ComposerProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [typed, setTyped] = useState(false);
  const canSend =
    (canSendDraft(value, template) || attachments.length > 0) && !disabled;

  return (
    <View
      className="rounded-[26px]"
      style={{
        boxShadow: colors.isDark
          ? '0 6px 18px rgba(0, 0, 0, 0.3)'
          : '0 6px 18px rgba(0, 0, 0, 0.08)',
      }}
    >
      <View className="overflow-hidden rounded-[26px] border border-border p-2">
        <GlassBackground
          className="rounded-[26px]"
          tintColor={`${colors.surface}b3`}
        />
        {/* Keeps the draft readable over messages scrolling under the glass. */}
        <View className="absolute inset-0 bg-surface/75" />
        {attachments.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2.5 px-1.5 pt-2"
            testID="composer-attachments"
          >
            {attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                attachment={attachment}
                onRemove={() => onRemoveAttachment?.(attachment.id)}
              />
            ))}
          </ScrollView>
        ) : null}
        <TextInput
          ref={ref}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          testID="composer-input"
          accessibilityLabel={t('chat.composer.label')}
          value={value}
          onChangeText={(text) => {
            if (!typed && text) {
              setTyped(true);
              onStartTyping?.();
            }
            onChangeText(text);
          }}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          editable={!disabled}
          multiline
          className="max-h-40 min-h-11 px-3 pt-2.5 pb-1 text-[17px] leading-[22px] text-foreground"
        />
        <View className="min-h-11 flex-row items-center justify-between gap-2">
          <View className="shrink flex-row items-center gap-1">
            {onAddAttachment ? (
              <Pressable
                testID="composer-add"
                accessibilityRole="button"
                accessibilityLabel={t('chat.attachments.add')}
                onPress={onAddAttachment}
                disabled={disabled}
                hitSlop={4}
                className="size-9 items-center justify-center rounded-full bg-fill active:scale-[0.94]"
              >
                <Icon name="add" size={22} className="text-foreground" />
              </Pressable>
            ) : null}
            {model ? (
              <Pressable
                testID="model-pill"
                accessibilityRole="button"
                accessibilityLabel={t('chat.pick_model', { model: model.name })}
                onPress={onPickModel}
                hitSlop={4}
                className="h-9 shrink flex-row items-center gap-1.5 rounded-full pr-2.5 pl-1.5 active:bg-fill"
              >
                <ModelMonogram
                  name={model.name}
                  family={model.family}
                  size={24}
                />
                <Text
                  numberOfLines={1}
                  className="shrink text-[15px] font-medium text-label-secondary"
                >
                  {model.name}
                </Text>
                <Icon name="chevron-down" size={13} className="text-muted" />
              </Pressable>
            ) : null}
          </View>
          {generating ? (
            <Pressable
              testID="composer-stop"
              accessibilityRole="button"
              accessibilityLabel={t('chat.composer.stop')}
              onPress={onStop}
              hitSlop={4}
              className="size-9 items-center justify-center rounded-[12px] bg-invert active:scale-[0.94]"
            >
              <View className="size-3 rounded-[3px] bg-invert-foreground" />
            </Pressable>
          ) : (
            <Pressable
              testID="composer-send"
              accessibilityRole="button"
              accessibilityLabel={t('chat.composer.send')}
              accessibilityState={{ disabled: !canSend }}
              onPress={onSend}
              disabled={!canSend}
              hitSlop={4}
              className={cn(
                'size-9 items-center justify-center rounded-[12px] active:scale-[0.94]',
                canSend ? 'bg-accent' : 'bg-disabled'
              )}
            >
              <Icon
                name="arrow-up"
                size={20}
                className="text-accent-foreground"
              />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

/** A draft attachment: a thumbnail or a document chip, with a remove button. */
function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="relative" testID={`composer-attachment-${attachment.id}`}>
      {attachment.kind === 'image' && attachment.thumbUri ? (
        <Image
          source={{ uri: attachment.thumbUri }}
          accessibilityLabel={attachment.name}
          style={{ width: 56, height: 56, borderRadius: 14 }}
          contentFit="cover"
        />
      ) : (
        <View className="h-14 max-w-[180px] flex-row items-center gap-2 rounded-[14px] bg-fill pr-3 pl-2.5">
          <Icon
            name="document-text-outline"
            size={22}
            className="text-accent-text"
          />
          <Text
            numberOfLines={2}
            className="shrink text-[13px] leading-[17px] text-foreground"
          >
            {attachment.name}
          </Text>
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chat.attachments.remove', {
          name: attachment.name,
        })}
        onPress={onRemove}
        hitSlop={10}
        className="absolute -top-1.5 -right-1.5 size-6 items-center justify-center rounded-full bg-invert"
      >
        <Icon name="close" size={14} className="text-invert-foreground" />
      </Pressable>
    </View>
  );
}

/** Something to send that is more than an untouched suggestion template. */
export function canSendDraft(draft: string, template?: string | null) {
  const text = draft.trim();
  return !!text && text !== template?.trim();
}
