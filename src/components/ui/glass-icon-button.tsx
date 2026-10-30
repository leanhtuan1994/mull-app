import { cn } from 'heroui-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { GlassLayer } from '@/components/glass/glass-layer';
import { useAccessibilitySettings } from '@/lib/hooks/use-accessibility-settings';

import { Icon, type IconName } from './icon';

/**
 * Background for floating controls: Liquid Glass, or a solid surface when
 * Reduce Transparency is on.
 */
export function GlassBackground({
  className,
  tintColor,
}: {
  className?: string;
  tintColor?: string;
}) {
  const { reduceTransparency } = useAccessibilitySettings();
  if (reduceTransparency) {
    return (
      <View
        className={cn(
          'absolute inset-0 border border-separator bg-glass-solid',
          className
        )}
      />
    );
  }
  return (
    <GlassLayer isInteractive tintColor={tintColor} className={className} />
  );
}

type GlassIconButtonProps = {
  icon: IconName;
  /** Required: icon-only buttons must be readable by VoiceOver. */
  accessibilityLabel: string;
  onPress: () => void;
  testID?: string;
  className?: string;
  iconClassName?: string;
};

/** 44×44 round glass button for title bars. */
export function GlassIconButton({
  icon,
  accessibilityLabel,
  onPress,
  testID,
  className,
  iconClassName,
}: GlassIconButtonProps) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={4}
      className={cn(
        'size-11 items-center justify-center overflow-hidden rounded-full active:scale-[0.94]',
        className
      )}
    >
      <GlassBackground className="rounded-full" />
      <Icon name={icon} size={22} className={iconClassName} />
    </Pressable>
  );
}

/** A glass pill with arbitrary content, e.g. the model name in the chat title bar. */
export function GlassPill({
  children,
  onPress,
  accessibilityLabel,
  testID,
  className,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  className?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={!onPress}
      className={cn(
        'h-11 flex-row items-center gap-2 overflow-hidden rounded-full px-3.5 active:scale-[0.96]',
        className
      )}
    >
      <GlassBackground className="rounded-full" />
      {children}
    </Pressable>
  );
}
