import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Icon, ProgressButton, Text, View } from '@/components/ui';
import { useAccessibilitySettings } from '@/lib/hooks/use-accessibility-settings';

/** "Starting the model…" with an indeterminate bar. */
export function LoadingModelRow() {
  const { t } = useTranslation();
  const { reduceMotion } = useAccessibilitySettings();
  const offset = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    offset.value = withRepeat(withTiming(1, { duration: 1100 }), -1, false);
    return () => cancelAnimation(offset);
  }, [offset, reduceMotion]);

  const bar = useAnimatedStyle(() => ({
    transform: [{ translateX: -120 + offset.value * 360 }],
  }));

  return (
    <View
      testID="loading-model"
      accessibilityRole="progressbar"
      accessibilityLabel={t('chat.loading_model')}
      className="gap-2"
    >
      <Text className="text-[15px] text-muted">{t('chat.loading_model')}</Text>
      <View className="h-1 w-60 overflow-hidden rounded-full bg-fill">
        <Animated.View
          className="h-full w-[120px] rounded-full bg-accent-text"
          style={reduceMotion ? { width: '50%' } : bar}
        />
      </View>
    </View>
  );
}

export function ContextTrimNote() {
  const { t } = useTranslation();
  return (
    <View
      testID="context-trimmed"
      className="flex-row items-center justify-center gap-1.5"
    >
      <Icon name="time-outline" size={13} className="text-muted" />
      <Text className="text-[13px] text-muted">
        {t('chat.context_trimmed')}
      </Text>
    </View>
  );
}

/** Load failure or iOS memory warning, with a way to pick a smaller model. */
export function LoadErrorCard({
  kind,
  onSwitchModel,
}: {
  kind: 'load' | 'memory';
  onSwitchModel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View
      testID="load-error-card"
      accessibilityRole="alert"
      className="gap-3 rounded-[22px] bg-surface p-4"
    >
      <View className="flex-row items-center gap-2">
        <Icon name="warning-outline" size={20} className="text-danger" />
        <Text className="flex-1 text-[17px] font-semibold text-foreground">
          {t(
            kind === 'memory'
              ? 'chat.errors.memory_title'
              : 'chat.errors.load_title'
          )}
        </Text>
      </View>
      <Text className="text-[15px] leading-[22px] text-muted">
        {t(
          kind === 'memory'
            ? 'chat.errors.memory_body'
            : 'chat.errors.load_body'
        )}
      </Text>
      <ProgressButton
        testID="load-error-switch"
        label={t('chat.errors.switch_model')}
        onPress={onSwitchModel}
        className="min-h-12"
      />
    </View>
  );
}

export function NoModelCard({ onOpenLibrary }: { onOpenLibrary: () => void }) {
  const { t } = useTranslation();
  return (
    <View
      testID="no-model-card"
      className="gap-3 rounded-[22px] bg-surface p-5"
    >
      <Text className="text-[17px] font-semibold text-foreground">
        {t('chat.no_model.title')}
      </Text>
      <Text className="text-[15px] leading-[22px] text-muted">
        {t('chat.no_model.body')}
      </Text>
      <ProgressButton
        testID="no-model-open-library"
        icon="cube-outline"
        label={t('chat.no_model.cta')}
        onPress={onOpenLibrary}
        className="min-h-12"
      />
    </View>
  );
}
