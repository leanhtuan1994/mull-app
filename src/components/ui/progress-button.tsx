import { cn } from 'heroui-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, type IconName } from './icon';
import { Text } from './text';

type ProgressButtonProps = {
  label: string;
  onPress: () => void;
  /** When set, shows a track filling from the left behind the label. */
  progress?: number | null;
  /** Indeterminate work, e.g. checking the file. */
  busy?: boolean;
  icon?: IconName;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  className?: string;
};

/** The primary pill button, which can also show download progress inside itself. */
export function ProgressButton({
  label,
  onPress,
  progress,
  busy,
  icon,
  disabled,
  testID,
  accessibilityLabel,
  className,
}: ProgressButtonProps) {
  const inProgress = progress !== undefined && progress !== null;
  const tinted = inProgress || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!tinted }}
      accessibilityValue={
        inProgress
          ? { min: 0, max: 100, now: Math.round(progress * 100) }
          : undefined
      }
      onPress={onPress}
      disabled={disabled}
      className={cn(
        'min-h-14 flex-row items-center justify-center gap-2 overflow-hidden rounded-full px-6 active:scale-[0.97]',
        tinted ? 'bg-track' : disabled ? 'bg-disabled' : 'bg-accent',
        className
      )}
    >
      {inProgress ? (
        <View
          testID={testID ? `${testID}-fill` : undefined}
          className="absolute inset-y-0 left-0 bg-accent-tint"
          style={{
            width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`,
          }}
        />
      ) : null}
      {busy ? <ActivityIndicator className="text-foreground" /> : null}
      {icon && !tinted ? (
        <Icon name={icon} size={20} className="text-accent-foreground" />
      ) : null}
      <Text
        className={cn(
          'text-[17px] font-semibold',
          tinted ? 'text-foreground' : 'text-accent-foreground'
        )}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
