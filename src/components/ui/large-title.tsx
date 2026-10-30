import { cn } from 'heroui-native';
import type { ComponentProps } from 'react';

import { Text } from './text';

/**
 * SF Rounded heavy title. Line height stays at 1.2× so stacked Vietnamese
 * diacritics (ể, ỗ, ặ) are never clipped.
 */
export function LargeTitle({
  className,
  size = 34,
  ...props
}: ComponentProps<typeof Text> & { size?: number }) {
  return (
    <Text
      accessibilityRole="header"
      className={cn(
        'font-rounded font-extrabold tracking-tight text-foreground',
        className
      )}
      style={{ fontSize: size, lineHeight: Math.round(size * 1.2) }}
      {...props}
    />
  );
}
