import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/** The Mull mark: a large and a small white circle on a mulberry tile. */
export function MullLogo({ size = 64 }: { size?: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center bg-accent"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.3),
        boxShadow: '0 10px 30px rgba(60, 20, 40, 0.22)',
      }}
    >
      <Svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24">
        <Circle cx={10.5} cy={13.5} r={6.2} fill="#fff" />
        <Circle cx={18} cy={6.5} r={2.6} fill="#fff" opacity={0.8} />
      </Svg>
    </View>
  );
}
