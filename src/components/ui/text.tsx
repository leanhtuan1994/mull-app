import { cn } from 'heroui-native';
import React from 'react';
import { Text as RNText } from 'react-native';

type TextProps = React.ComponentProps<typeof RNText>;

/**
 * Dynamic Type stops growing at 1.6× so the largest accessibility sizes stay
 * readable without breaking fixed layouts (title bars, pills, the composer).
 */
export const MAX_FONT_SCALE = 1.6;

export function Text({ className, ...props }: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      className={cn('font-normal', className)}
      {...props}
    />
  );
}
