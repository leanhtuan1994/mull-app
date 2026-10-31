import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';
import { useStore } from 'zustand';

import { Icon, Text, View } from '@/components/ui';
import type { AttachmentRow } from '@/db/types';
import { attachments as attachmentFiles, ingest } from '@/features/services';
import { formatBytes, formatPercent } from '@/lib/format';

export const UserBubble = memo(function UserBubble({
  content,
  attachments = [],
}: {
  content: string;
  attachments?: AttachmentRow[];
}) {
  const images = attachments.filter((a) => a.kind === 'image');
  const documents = attachments.filter((a) => a.kind === 'document');
  return (
    <View className="max-w-[80%] gap-1.5 self-end">
      {images.length > 0 ? <ImageGrid images={images} /> : null}
      {documents.map((doc) => (
        <DocumentCard key={doc.id} document={doc} />
      ))}
      <View
        testID="user-bubble"
        className="self-end bg-bubble px-[15px] py-2.5"
        style={{
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          borderBottomLeftRadius: 22,
          borderBottomRightRadius: 6,
        }}
      >
        <Text selectable className="text-[17px] leading-[25px] text-foreground">
          {content}
        </Text>
      </View>
    </View>
  );
});

const fileUri = (relative: string) =>
  `file://${attachmentFiles.absolute(relative)}`;

/** One image keeps its shape; several share a two-column grid of squares. */
function ImageGrid({ images }: { images: AttachmentRow[] }) {
  const { t } = useTranslation();
  const single = images.length === 1;
  return (
    <View className="flex-row flex-wrap justify-end gap-1.5">
      {images.map((image) => {
        const ratio =
          image.width && image.height ? image.width / image.height : 1;
        const size = single
          ? { width: 220, height: Math.min(300, 220 / ratio) }
          : { width: 120, height: 120 };
        return (
          <Pressable
            key={image.id}
            testID={`bubble-image-${image.id}`}
            accessibilityRole="imagebutton"
            accessibilityLabel={t('chat.attachments.open_image', {
              name: image.name,
            })}
            onPress={() =>
              router.push({
                pathname: '/image-viewer',
                params: { id: String(image.id) },
              })
            }
          >
            <Image
              source={{ uri: fileUri(image.thumbPath ?? image.path) }}
              placeholder={null}
              style={{ ...size, borderRadius: 18 }}
              contentFit="cover"
              recyclingKey={String(image.id)}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function DocumentCard({ document }: { document: AttachmentRow }) {
  const { t } = useTranslation();
  const live = useStore(ingest.store, (s) => s[document.id]);
  const progress = live ?? ingest.progressOf(document);
  const status =
    progress.status === 'extracting'
      ? t('chat.attachments.reading')
      : progress.status === 'embedding'
        ? t('chat.attachments.indexing', {
            percent: formatPercent(progress.fraction),
          })
        : progress.status === 'failed'
          ? progress.error === 'no_text'
            ? t('chat.attachments.no_text')
            : t('chat.attachments.unreadable')
          : null;
  const detail = [
    document.pageCount
      ? t('chat.attachments.pages', { count: document.pageCount })
      : null,
    formatBytes(document.sizeBytes),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <View
      testID={`bubble-document-${document.id}`}
      accessible
      accessibilityLabel={`${document.name}, ${detail}`}
      className="flex-row items-center gap-3 self-end rounded-[18px] bg-surface py-2.5 pr-4 pl-3"
    >
      <View className="size-10 items-center justify-center rounded-[12px] bg-accent-tint">
        <Icon
          name="document-text-outline"
          size={22}
          className="text-accent-text"
        />
      </View>
      <View className="shrink">
        <Text
          numberOfLines={2}
          className="text-[15px] font-semibold text-foreground"
        >
          {document.name}
        </Text>
        <Text className="text-[13px] text-muted">{detail}</Text>
        {status ? (
          <Text
            testID={`bubble-document-status-${document.id}`}
            className={
              progress.status === 'failed'
                ? 'text-[13px] text-danger'
                : 'text-[13px] text-accent-text'
            }
          >
            {status}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
