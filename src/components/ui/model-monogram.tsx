import { View } from 'react-native';

import type { ModelFamily } from '@/features/models/catalog-schema';

import { Text } from './text';

/** One color per model family, dark enough for white text in both themes. */
export const FAMILY_COLORS: Record<ModelFamily, string> = {
  qwen: '#4B4F8F',
  llama: '#5B6B3A',
  gemma: '#2F6F8F',
  smollm: '#3F7A6A',
  phi: '#8F5B2F',
};

export function monogramGlyph(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() ?? '?';
}

/** Rounded-square initial in the family color, sized like an app icon. */
export function ModelMonogram({
  name,
  family,
  size = 38,
}: {
  name: string;
  family: ModelFamily;
  size?: number;
}) {
  return (
    <View
      testID="model-monogram"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.29),
        backgroundColor: FAMILY_COLORS[family],
      }}
    >
      <Text
        className="font-rounded font-extrabold text-white"
        style={{
          fontSize: Math.round(size * 0.45),
          lineHeight: Math.round(size * 0.6),
        }}
      >
        {monogramGlyph(name)}
      </Text>
    </View>
  );
}
