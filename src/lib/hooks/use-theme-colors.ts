import { useCSSVariable } from 'uniwind';

import { useAppTheme } from '@/lib/contexts/app-theme-context';

const read = (value: unknown, fallback: string) =>
  typeof value === 'string' && value ? value : fallback;

/** Theme colors as plain strings, for APIs that do not take class names. */
export function useThemeColors() {
  const { isDark } = useAppTheme();
  const background = useCSSVariable('--color-background');
  const foreground = useCSSVariable('--color-foreground');
  const muted = useCSSVariable('--color-muted');
  const surface = useCSSVariable('--color-surface');
  const accentText = useCSSVariable('--color-accent-text');
  const separator = useCSSVariable('--color-separator');
  const fill = useCSSVariable('--color-fill');
  const drawer = useCSSVariable('--color-drawer');
  const track = useCSSVariable('--color-track');
  return {
    isDark,
    background: read(background, isDark ? '#171513' : '#F5F1EA'),
    foreground: read(foreground, isDark ? '#F2EDE6' : '#1D1B18'),
    muted: read(muted, isDark ? '#A39B8F' : '#69635A'),
    surface: read(surface, isDark ? '#24211D' : '#FFFDF9'),
    accentText: read(accentText, isDark ? '#BF8BA3' : '#8A2C58'),
    separator: read(
      separator,
      isDark ? 'rgba(255,240,220,0.12)' : 'rgba(60,40,20,0.14)'
    ),
    fill: read(fill, isDark ? 'rgba(255,240,220,0.1)' : 'rgba(60,40,20,0.08)'),
    drawer: read(drawer, isDark ? '#0F0E0C' : '#E9E2D7'),
    track: read(track, isDark ? '#35302A' : '#EFEAE2'),
  };
}
