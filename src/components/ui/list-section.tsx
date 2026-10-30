import { cn } from 'heroui-native';
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from './icon';
import { Text } from './text';

/** iOS inset-grouped section: small header, rounded 22 card, hairline separators. */
export function ListSection({
  title,
  footer,
  children,
  testID,
  className,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
  className?: string;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View testID={testID} className={cn('gap-1.5', className)}>
      {title ? (
        <Text
          accessibilityRole="header"
          className="px-4 text-[13px] text-muted"
        >
          {title}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-[22px] bg-surface">
        {rows.map((row, index) => (
          <Fragment key={row.key ?? index}>
            {index > 0 ? (
              <View
                className="ml-4 bg-separator"
                style={{ height: StyleSheet.hairlineWidth }}
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </View>
      {typeof footer === 'string' ? (
        <Text className="px-4 text-[13px] leading-[19px] text-muted">
          {footer}
        </Text>
      ) : (
        footer
      )}
    </View>
  );
}

type ListRowProps = {
  title: string;
  value?: string;
  /** Leading element, e.g. a monogram. */
  leading?: ReactNode;
  /** Trailing element replacing the value and chevron. */
  trailing?: ReactNode;
  subtitle?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  destructive?: boolean;
  accent?: boolean;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function ListRow({
  title,
  value,
  leading,
  trailing,
  subtitle,
  onPress,
  onLongPress,
  chevron = !!onPress,
  destructive,
  accent,
  disabled,
  testID,
  accessibilityLabel,
  accessibilityHint,
}: ListRowProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled || (!onPress && !onLongPress)}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={
        accessibilityLabel ?? (value ? `${title}, ${value}` : title)
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      className={cn(
        'min-h-[52px] flex-row items-center gap-3 px-4 py-2.5 active:bg-fill',
        disabled && 'opacity-50'
      )}
    >
      {leading}
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            'text-[17px] leading-[22px] text-foreground',
            destructive && 'text-danger',
            accent && 'text-accent-text'
          )}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-[13px] leading-[18px] text-muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (
        <>
          {value ? (
            <Text
              numberOfLines={1}
              className="max-w-[55%] text-[17px] text-muted"
            >
              {value}
            </Text>
          ) : null}
          {chevron ? (
            <Icon name="chevron-forward" size={16} className="text-chevron" />
          ) : null}
        </>
      )}
    </Pressable>
  );
}
