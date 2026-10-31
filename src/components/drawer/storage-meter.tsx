import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable } from 'react-native';

import { Text, View } from '@/components/ui';
import {
  getCatalogModels,
  totalBytes as modelTotalBytes,
} from '@/features/models/catalog';
import { useModels } from '@/features/services';
import { formatBytes } from '@/lib/format';

import { MullFiles } from '../../../modules/mull-files';

/** "Models on this iPhone" with a bar of their share of total storage. */
export function StorageMeter({ onPress }: { onPress: () => void }) {
  const { t } = useTranslation();
  const downloadedIds = useModels((s) => s.downloadedIds);
  const [totalBytes, setTotalBytes] = useState(0);

  useEffect(() => {
    MullFiles.diskSpace()
      .then(({ total }) => setTotalBytes(total))
      .catch(() => undefined);
  }, []);

  const used = getCatalogModels()
    .filter((m) => downloadedIds.includes(m.id))
    .reduce((sum, m) => sum + modelTotalBytes(m), 0);
  const share =
    totalBytes > 0 ? Math.max(used > 0 ? 0.02 : 0, used / totalBytes) : 0;

  return (
    <Pressable
      testID="drawer-storage"
      accessibilityRole="button"
      accessibilityLabel={`${t('drawer.storage_meter')}, ${formatBytes(used)}`}
      onPress={onPress}
      className="mt-2 gap-2 rounded-2xl px-2.5 py-3 active:bg-fill"
    >
      <View className="flex-row justify-between">
        <Text className="text-[13px] text-muted">
          {t('drawer.storage_meter')}
        </Text>
        <Text
          className="text-[13px] font-semibold text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {formatBytes(used)}
        </Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-fill">
        <View
          className="h-full rounded-full bg-accent"
          style={{ width: `${share * 100}%` }}
        />
      </View>
    </Pressable>
  );
}
