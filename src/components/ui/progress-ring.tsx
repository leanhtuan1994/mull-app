import Svg, { Circle } from 'react-native-svg';

import { useThemeColors } from '@/lib/hooks/use-theme-colors';

export function ringGeometry(
  size: number,
  strokeWidth: number,
  fraction: number
) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, fraction));
  return { radius, circumference, dashOffset: circumference * (1 - clamped) };
}

/** Circular progress, filled clockwise from 12 o'clock. */
export function ProgressRing({
  fraction,
  size = 26,
  strokeWidth = 2.5,
  testID,
}: {
  fraction: number;
  size?: number;
  strokeWidth?: number;
  testID?: string;
}) {
  const { radius, circumference, dashOffset } = ringGeometry(
    size,
    strokeWidth,
    fraction
  );
  const colors = useThemeColors();
  return (
    <Svg
      testID={testID}
      width={size}
      height={size}
      style={{ transform: [{ rotate: '-90deg' }] }}
      accessibilityElementsHidden
    >
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        stroke={colors.track}
      />
      <Circle
        testID={testID ? `${testID}-value` : undefined}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        stroke={colors.accentText}
      />
    </Svg>
  );
}
