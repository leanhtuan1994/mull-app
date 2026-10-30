import { Fragment, useMemo } from 'react';
import { useMarkdown } from 'react-native-marked';

import { useThemeColors } from '@/lib/hooks/use-theme-colors';

/** Paragraphs, lists, bold and code blocks in the app's type and colors. */
export function MarkdownText({ value }: { value: string }) {
  const colors = useThemeColors();
  const options = useMemo(
    () => ({
      colorScheme: colors.isDark ? ('dark' as const) : ('light' as const),
      theme: {
        colors: {
          text: colors.foreground,
          link: colors.accentText,
          code: colors.fill,
          border: colors.separator,
        },
      },
      styles: {
        text: { fontSize: 17, lineHeight: 25, color: colors.foreground },
        paragraph: { paddingVertical: 4 },
        li: { fontSize: 17, lineHeight: 25, color: colors.foreground },
        strong: { fontWeight: '700' as const },
        codespan: {
          fontFamily: 'Menlo',
          fontSize: 15,
          backgroundColor: colors.fill,
          color: colors.foreground,
        },
        code: {
          backgroundColor: colors.fill,
          borderRadius: 14,
          padding: 12,
          marginVertical: 6,
        },
        codeText: {
          fontFamily: 'Menlo',
          fontSize: 14,
          lineHeight: 20,
          color: colors.foreground,
        },
        h1: {
          fontSize: 22,
          lineHeight: 30,
          fontWeight: '700' as const,
          color: colors.foreground,
        },
        h2: {
          fontSize: 20,
          lineHeight: 27,
          fontWeight: '700' as const,
          color: colors.foreground,
        },
        h3: {
          fontSize: 18,
          lineHeight: 25,
          fontWeight: '700' as const,
          color: colors.foreground,
        },
      },
    }),
    [colors]
  );
  const elements = useMarkdown(value, options);
  return (
    <>
      {elements.map((element, index) => (
        <Fragment key={index}>{element}</Fragment>
      ))}
    </>
  );
}
