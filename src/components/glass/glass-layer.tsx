import {
  GlassView as NativeGlassView,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { cn, GlassView } from 'heroui-native';
import { Platform, View } from 'react-native';
import { withUniwind } from 'uniwind';

const StyledNativeGlass = withUniwind(NativeGlassView);

type GlassLayerProps = {
  className?: string;
  isInteractive?: boolean;
  /** Tints Liquid Glass so a control reads as a surface over plain backgrounds. */
  tintColor?: string;
};

export function GlassLayer({
  className,
  isInteractive,
  tintColor,
}: GlassLayerProps) {
  const layerClassName = cn('absolute inset-0', className);

  if (Platform.OS === 'ios' && isLiquidGlassAvailable()) {
    return (
      <StyledNativeGlass
        glassEffectStyle="regular"
        isInteractive={isInteractive}
        tintColor={tintColor}
        className={layerClassName}
      />
    );
  }

  if (Platform.OS === 'ios') {
    return <GlassView intensity={60} className={layerClassName} />;
  }

  return (
    <View
      testID="glass-fallback"
      className={cn('absolute inset-0 bg-surface/70', className)}
    />
  );
}
