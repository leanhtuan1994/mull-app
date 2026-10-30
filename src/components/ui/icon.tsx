import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { withUniwind } from 'uniwind';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/** Ionicons that take a Uniwind `className` for color. Decorative by default. */
const StyledIonicons = withUniwind(Ionicons);

export function Icon({
  name,
  size = 22,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <StyledIonicons
      name={name}
      size={size}
      className={className ?? 'text-foreground'}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
