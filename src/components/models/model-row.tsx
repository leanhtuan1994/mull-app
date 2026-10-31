import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { Icon, ModelMonogram, ProgressRing, Text, View } from '@/components/ui';
import { totalBytes } from '@/features/models/catalog';
import type { CatalogModel } from '@/features/models/catalog-schema';
import { minimumRamGB } from '@/features/models/compatibility';
import { downloadFraction } from '@/features/models/download-machine';
import { useStartDownload } from '@/features/models/use-start-download';
import { getModels, useLlm, useModels } from '@/features/services';
import { formatBytes, formatParams, formatPercent } from '@/lib/format';

/** One library row: tap for details; trailing control downloads, cancels or explains why not. */
export function ModelRow({
  model,
  blocked,
}: {
  model: CatalogModel;
  blocked: boolean;
}) {
  const { t } = useTranslation();
  const start = useStartDownload();
  const download = useModels((s) => s.downloads[model.id]);
  const downloaded = useModels((s) => s.downloadedIds.includes(model.id));
  const inUse = useLlm((s) => s.loadedModelId === model.id);
  const status = download?.status;
  const active =
    status === 'queued' || status === 'downloading' || status === 'verifying';
  const fraction = downloadFraction(download);

  const subtitle = active
    ? status === 'verifying'
      ? t('downloads.verifying')
      : t('downloads.downloading_short', { percent: formatPercent(fraction) })
    : status === 'failed'
      ? t('downloads.failed_retry')
      : t('models.row_subtitle', {
          params: formatParams(model.params),
          size: formatBytes(totalBytes(model)),
          publisher: model.publisher,
        });

  return (
    <View
      className="flex-row items-center pr-3"
      style={{ opacity: blocked ? 0.55 : 1 }}
    >
      <Pressable
        testID={`model-row-${model.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${model.name}, ${subtitle}`}
        onPress={() =>
          router.push({ pathname: '/model/[id]', params: { id: model.id } })
        }
        className="min-w-0 flex-1 flex-row items-center gap-3 py-3 pr-2 pl-4 active:bg-fill"
      >
        <ModelMonogram name={model.name} family={model.family} size={38} />
        <View className="min-w-0 flex-1">
          <Text className="text-[17px] text-foreground">{model.name}</Text>
          <Text
            numberOfLines={1}
            className={
              status === 'failed'
                ? 'text-[13px] text-danger'
                : 'text-[13px] text-muted'
            }
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {subtitle}
          </Text>
        </View>
      </Pressable>

      {downloaded && inUse ? (
        <View className="rounded-[9px] bg-accent-tint px-2 py-1">
          <Text className="text-[11px] font-bold text-accent-text">
            {t('models.in_use_badge')}
          </Text>
        </View>
      ) : null}

      {active ? (
        <Pressable
          testID={`model-cancel-${model.id}`}
          accessibilityRole="button"
          accessibilityLabel={t('downloads.cancel_with_progress', {
            percent: formatPercent(fraction),
          })}
          onPress={() => void getModels().cancel(model.id)}
          disabled={status === 'verifying'}
          className="size-11 items-center justify-center"
        >
          <ProgressRing
            fraction={fraction}
            size={26}
            testID={`model-progress-${model.id}`}
          />
          <View className="absolute size-2 rounded-[2px] bg-accent-text" />
        </Pressable>
      ) : null}

      {!downloaded && !active && !blocked ? (
        <Pressable
          testID={`model-download-${model.id}`}
          accessibilityRole="button"
          accessibilityLabel={t('downloads.download_model', {
            model: model.name,
          })}
          onPress={() => void start(model)}
          className="size-11 items-center justify-center active:scale-[0.94]"
        >
          <Icon
            name={status === 'failed' ? 'refresh' : 'cloud-download-outline'}
            size={24}
            className="text-accent-text"
          />
        </Pressable>
      ) : null}

      {blocked && !downloaded ? (
        <Text className="text-right text-[13px] text-muted">
          {t('models.blocked', { ram: minimumRamGB(model) })}
        </Text>
      ) : null}
    </View>
  );
}
