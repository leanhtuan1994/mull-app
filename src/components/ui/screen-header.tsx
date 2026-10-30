import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

export const HEADER_BAR_HEIGHT = 48;

/** Height of the floating header including the status bar, for content insets. */
export function useHeaderInset(): number {
  const { top } = useSafeAreaInsets();
  return top + HEADER_BAR_HEIGHT + 8;
}

/**
 * Floating title bar: glass controls over the content, with the background
 * fading in behind them so text scrolls under it softly.
 */
export function ScreenHeader({
  left,
  center,
  right,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  const { top } = useSafeAreaInsets();
  const background = String(useCSSVariable('--color-background') ?? '#F5F1EA');
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 top-0 z-10">
      <LinearGradient
        pointerEvents="none"
        colors={[background, background, `${background}00`]}
        locations={[0, 0.6, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: top + HEADER_BAR_HEIGHT + 28,
        }}
      />
      <View
        pointerEvents="box-none"
        className="flex-row items-center justify-between px-4"
        style={{ paddingTop: top + 4, height: top + HEADER_BAR_HEIGHT + 4 }}
      >
        <View pointerEvents="box-none" className="min-w-11">
          {left}
        </View>
        <View
          pointerEvents="box-none"
          className="flex-1 flex-row justify-center px-2"
        >
          {center}
        </View>
        <View pointerEvents="box-none" className="min-w-11 items-end">
          {right}
        </View>
      </View>
    </View>
  );
}
