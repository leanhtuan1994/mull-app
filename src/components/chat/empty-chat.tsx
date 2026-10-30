import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { MullLogo } from '@/components/onboarding/mull-logo';
import { LargeTitle, Text, View } from '@/components/ui';

/** `needsInput`: the prompt ends where the user pastes or types their own text. */
const SUGGESTIONS = [
  { key: 'summarize', needsInput: true },
  { key: 'explain', needsInput: false },
  { key: 'reply', needsInput: true },
  { key: 'plan', needsInput: true },
] as const;

/** The greeting on a new chat. */
export function EmptyChatGreeting({ modelName }: { modelName: string | null }) {
  const { t } = useTranslation();
  return (
    <View className="items-center px-6" testID="new-chat-greeting">
      <MullLogo size={64} />
      <LargeTitle size={30} className="mt-5 text-center">
        {t('chat.welcome_title')}
      </LargeTitle>
      {modelName ? (
        <Text className="mt-2.5 max-w-[300px] text-center text-[15px] leading-[22px] text-muted">
          {t('chat.welcome_body', { model: modelName })}
        </Text>
      ) : null}
    </View>
  );
}

/** Four starters. Tapping one fills the composer; it does not send. */
export function SuggestionGrid({
  onPick,
}: {
  onPick: (prompt: string, needsInput: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="flex-row flex-wrap gap-2.5" testID="suggestions">
      {SUGGESTIONS.map(({ key, needsInput }) => (
        <Pressable
          key={key}
          testID={`suggestion-${key}`}
          accessibilityRole="button"
          onPress={() =>
            onPick(t(`chat.suggestions.${key}_prompt`), needsInput)
          }
          className="min-h-[72px] grow basis-[45%] gap-0.5 rounded-[20px] border border-border bg-surface px-4 py-3.5 active:scale-[0.97]"
        >
          <Text className="text-[15px] font-semibold text-foreground">
            {t(`chat.suggestions.${key}_title`)}
          </Text>
          <Text className="text-[13px] leading-[18px] text-muted">
            {t(`chat.suggestions.${key}_body`)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
