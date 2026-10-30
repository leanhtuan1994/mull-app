import { useDrawerProgress } from 'expo-router/drawer';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { useAccessibilitySettings } from '@/lib/hooks/use-accessibility-settings';

/**
 * Wraps a drawer screen so it shrinks to 94% and rounds to 44 pt while the
 * sidebar slides in, following the finger. Skipped under Reduce Motion.
 */
export function DrawerScene({ children }: { children: ReactNode }) {
  const progress = useDrawerProgress();
  const { reduceMotion } = useAccessibilitySettings();

  const style = useAnimatedStyle(() => {
    if (reduceMotion) return {};
    return {
      transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0.94]) }],
      borderRadius: interpolate(progress.value, [0, 1], [0, 44]),
    };
  });

  return (
    <Animated.View style={[styles.scene, style]} className="bg-background">
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: { flex: 1, overflow: 'hidden', borderCurve: 'continuous' },
});
