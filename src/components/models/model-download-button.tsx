import { useTranslation } from 'react-i18next';

import { ProgressButton, Text, View } from '@/components/ui';
import { totalBytes } from '@/features/models/catalog';
import type { CatalogModel } from '@/features/models/catalog-schema';
import { downloadFraction } from '@/features/models/download-machine';
import { useStartDownload } from '@/features/models/use-start-download';
import { getModels, useModels } from '@/features/services';
import { formatBytes, formatPercent } from '@/lib/format';

/**
 * Download, then progress inside the button (tap to cancel), then checking,
 * then "Start chatting" once the verified file is on the device.
 */
export function ModelDownloadButton({
  model,
  onStartChat,
  progressStyle = 'percent',
  testID = 'model-download-button',
}: {
  model: CatalogModel;
  onStartChat: () => void;
  /** `percent` for onboarding, `bytes` ("1,2 / 2,5 GB") for the detail sheet. */
  progressStyle?: 'percent' | 'bytes';
  testID?: string;
}) {
  const { t } = useTranslation();
  const start = useStartDownload();
  const download = useModels((s) => s.downloads[model.id]);
  const downloaded = useModels((s) => s.downloadedIds.includes(model.id));
  const status = download?.status;

  if (downloaded) {
    // An embedding model only reads documents; there is no chat to start.
    return model.kind === 'embedding' ? (
      <ProgressButton
        testID={testID}
        label={t('downloads.ready_for_documents')}
        onPress={() => {}}
        disabled
      />
    ) : (
      <ProgressButton
        testID={testID}
        label={t('downloads.start_chat')}
        onPress={onStartChat}
      />
    );
  }

  if (status === 'verifying') {
    return (
      <ProgressButton
        testID={testID}
        label={t('downloads.verifying')}
        busy
        onPress={() => {}}
      />
    );
  }

  if (status === 'queued' || status === 'downloading') {
    const fraction = downloadFraction(download);
    const label =
      progressStyle === 'bytes'
        ? t('downloads.progress_of', {
            done: formatBytes(download?.bytesDone ?? 0),
            total: formatBytes(totalBytes(model)),
          })
        : t('downloads.downloading', { percent: formatPercent(fraction) });
    return (
      <ProgressButton
        testID={testID}
        label={label}
        progress={fraction}
        accessibilityLabel={t('downloads.cancel_with_progress', {
          percent: formatPercent(fraction),
        })}
        onPress={() => void getModels().cancel(model.id)}
      />
    );
  }

  return (
    <View className="gap-2">
      <ProgressButton
        testID={testID}
        icon="cloud-download-outline"
        label={
          status === 'failed'
            ? t('downloads.failed_retry')
            : t('downloads.download', { size: formatBytes(totalBytes(model)) })
        }
        onPress={() => void start(model)}
      />
      {status === 'failed' && download?.error ? (
        <Text
          accessibilityRole="alert"
          className="text-center text-[13px] text-danger"
        >
          {t(`downloads.errors.${download.error}`)}
        </Text>
      ) : null}
    </View>
  );
}
