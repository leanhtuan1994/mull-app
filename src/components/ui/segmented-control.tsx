import { cn } from 'heroui-native';
import { Pressable, View } from 'react-native';

import { Text } from './text';

type Option<T extends string> = { value: T; label: string; testID?: string };

/** iOS-style segmented control: a fill track with a raised selected segment. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  className?: string;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      className={cn('flex-row rounded-[14px] bg-fill p-[3px]', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={option.testID}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            className={cn(
              'min-h-[36px] flex-1 items-center justify-center rounded-[11px] px-2',
              selected && 'bg-segment shadow-sm'
            )}
          >
            <Text
              numberOfLines={1}
              className={cn(
                'text-center text-[14px] font-semibold',
                selected ? 'text-segment-foreground' : 'text-foreground'
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
