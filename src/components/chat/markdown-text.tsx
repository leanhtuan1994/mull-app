import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useToast } from 'heroui-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking } from 'react-native';
import {
  EnrichedMarkdownText,
  type MarkdownStyle,
} from 'react-native-enriched-markdown';
import remend from 'remend';

import { MAX_FONT_SCALE } from '@/components/ui/text';
import { prepareMarkdown } from '@/features/chat/prepare-markdown';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

const MONO = 'Menlo';

/** Syntax colors tuned to the warm paper and ink grounds. */
const SYNTAX = {
  light: {
    keyword: '#8A2C58',
    string: '#3F6B2A',
    number: '#9A5B13',
    constant: '#9A5B13',
    comment: '#8A8276',
    function: '#2F5F8A',
    type: '#6B3F8A',
    property: '#2F6F6A',
    tag: '#8A2C58',
    attribute: '#9A5B13',
  },
  dark: {
    keyword: '#D99AB8',
    string: '#A9CF8E',
    number: '#E3B37A',
    constant: '#E3B37A',
    comment: '#8F877B',
    function: '#8DB8E0',
    type: '#C3A3E0',
    property: '#86C7BF',
    tag: '#D99AB8',
    attribute: '#E3B37A',
  },
};

/**
 * An answer rendered as native rich text: GitHub-flavoured markdown with
 * tables, task lists, highlighted code with a copy button, and LaTeX math.
 */
export function MarkdownText({
  value,
  streaming,
  citations,
}: {
  value: string;
  /** Lets tables and code blocks appear progressively without flicker. */
  streaming?: boolean;
  /** Citation number → chunk id; `[n]` becomes a link to that passage. */
  citations?: ReadonlyMap<number, number>;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const colors = useThemeColors();

  // While streaming, close dangling `**`, backticks, links and `$$` so the
  // half-written tail renders as formatted text instead of raw markers.
  const markdown = useMemo(
    () =>
      prepareMarkdown(streaming ? remend(value) : value, {
        imageLabel: t('chat.markdown.image', { alt: '{alt}' }),
        citations,
      }),
    [value, streaming, t, citations]
  );

  const style = useMemo<MarkdownStyle>(() => {
    const body = { fontSize: 17, lineHeight: 25, color: colors.foreground };
    const heading = (fontSize: number) => ({
      fontSize,
      lineHeight: Math.round(fontSize * 1.35),
      fontWeight: '700',
      color: colors.foreground,
      marginTop: 10,
      marginBottom: 4,
    });
    return {
      paragraph: { ...body, marginBottom: 10 },
      h1: heading(22),
      h2: heading(20),
      h3: heading(18),
      h4: heading(17),
      strong: { color: colors.foreground },
      em: { color: colors.foreground },
      link: { color: colors.accentText, underline: true },
      list: {
        ...body,
        bulletColor: colors.muted,
        markerColor: colors.muted,
        gapWidth: 8,
        itemSpacing: 4,
        marginBottom: 10,
      },
      blockquote: {
        ...body,
        color: colors.muted,
        borderColor: colors.accentText,
        borderWidth: 3,
        gapWidth: 12,
        marginBottom: 10,
      },
      code: {
        fontFamily: MONO,
        fontSize: 15,
        color: colors.foreground,
        backgroundColor: colors.fill,
        borderColor: 'transparent',
      },
      codeBlock: {
        fontFamily: MONO,
        fontSize: 14,
        lineHeight: 20,
        color: colors.foreground,
        backgroundColor: colors.fill,
        borderColor: colors.separator,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        marginBottom: 12,
        syntaxColors: colors.isDark ? SYNTAX.dark : SYNTAX.light,
      },
      table: {
        fontSize: 15,
        lineHeight: 21,
        color: colors.foreground,
        headerBackgroundColor: colors.fill,
        headerTextColor: colors.foreground,
        borderColor: colors.separator,
        borderWidth: 1,
        borderRadius: 12,
        cellPaddingHorizontal: 10,
        cellPaddingVertical: 8,
        marginBottom: 12,
      },
      taskList: {
        checkedColor: colors.accentText,
        borderColor: colors.muted,
        checkmarkColor: colors.surface,
        checkedTextColor: colors.muted,
        checkedStrikethrough: false,
      },
      thematicBreak: {
        color: colors.separator,
        marginTop: 8,
        marginBottom: 16,
      },
      math: {
        fontSize: 19,
        color: colors.foreground,
        backgroundColor: 'transparent',
        padding: 4,
        textAlign: 'center',
        marginBottom: 12,
      },
      inlineMath: { color: colors.foreground },
    };
  }, [colors]);

  const openLink = ({ url }: { url: string }) => {
    if (url.startsWith('mull:')) {
      // Only citations of passages this answer was given open in the app.
      const match = /^mull:\/\/source\/(\d+)$/.exec(url);
      const chunkId = match ? Number(match[1]) : NaN;
      if ([...(citations?.values() ?? [])].includes(chunkId))
        router.push(`/source/${chunkId}`);
      return;
    }
    if (!/^https?:\/\//i.test(url)) return;
    let host = url;
    try {
      host = new URL(url).host;
    } catch {
      // Show the raw URL when it does not parse.
    }
    Alert.alert(t('chat.markdown.open_link_title'), host, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('chat.markdown.open_link'),
        onPress: () => void Linking.openURL(url),
      },
    ]);
  };

  return (
    <EnrichedMarkdownText
      markdown={markdown}
      flavor="github"
      markdownStyle={style}
      streamingAnimation={streaming}
      onLinkPress={openLink}
      enableLinkPreview={false}
      enableTaskListItemToggle={false}
      onCopyPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toast.show({ label: t('chat.actions.copied') });
      }}
      maxFontSizeMultiplier={MAX_FONT_SCALE}
      selectionColor={colors.accentText}
      accessibilityLabels={{
        list: {
          bulletPoint: t('chat.markdown.a11y.bullet'),
          nestedBulletPoint: t('chat.markdown.a11y.nested_bullet'),
          orderedItem: t('chat.markdown.a11y.ordered_item', { index: '{n}' }),
          nestedOrderedItem: t('chat.markdown.a11y.nested_ordered_item', {
            index: '{n}',
          }),
        },
        blockquote: {
          quote: t('chat.markdown.a11y.quote'),
          nestedQuote: t('chat.markdown.a11y.nested_quote'),
        },
        table: {
          row: t('chat.markdown.a11y.table_row', {
            index: '{n}',
            content: '{content}',
          }),
        },
        math: {
          equation: t('chat.markdown.a11y.equation', { latex: '{latex}' }),
        },
        rotor: {
          headings: t('chat.markdown.a11y.headings'),
          links: t('chat.markdown.a11y.links'),
          images: t('chat.markdown.a11y.images'),
        },
      }}
    />
  );
}
