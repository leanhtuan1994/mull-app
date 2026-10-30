import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/ui/segmented-control';
import type { ThemeName } from '@/lib/contexts/app-theme-context';
import { useSelectedTheme } from '@/lib/hooks';

const THEMES: ThemeName[] = ['system', 'light', 'dark'];

/** Automatic / Light / Dark, saved to MMKV and restored on launch. */
export function ThemeSelector() {
  const { t } = useTranslation();
  const { selectedTheme, setSelectedTheme } = useSelectedTheme();

  return (
    <SegmentedControl<ThemeName>
      accessibilityLabel={t('settings.theme.title')}
      value={selectedTheme}
      onChange={setSelectedTheme}
      options={THEMES.map((theme) => ({
        value: theme,
        label: t(`settings.theme.${theme}`),
        testID: `settings-theme-${theme}`,
      }))}
    />
  );
}
