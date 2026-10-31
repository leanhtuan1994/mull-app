import { useTranslation } from 'react-i18next';

import { ModelDownloadButton } from '@/components/models/model-download-button';
import { ProgressButton, Text, View } from '@/components/ui';
import { getChatModels, totalBytes } from '@/features/models/catalog';
import type { CatalogModel } from '@/features/models/catalog-schema';
import { fitsDevice } from '@/features/models/compatibility';
import { getDeviceInfo } from '@/features/models/use-device-info';
import { useModels } from '@/features/services';
import { formatBytes } from '@/lib/format';

/** The largest vision model this iPhone runs. */
export function suggestedVisionModel(): CatalogModel | undefined {
  const { totalBytes: ram } = getDeviceInfo();
  return getChatModels()
    .filter((m) => m.vision && fitsDevice(m, ram))
    .sort((a, b) => totalBytes(b) - totalBytes(a))[0];
}

/**
 * Shown when images are attached but the chat's model cannot read them:
 * switch to a vision model, downloading it first if needed.
 */
export function VisionModelCard({
  currentName,
  onUse,
}: {
  currentName: string;
  onUse: (modelId: string) => void;
}) {
  const { t } = useTranslation();
  const model = suggestedVisionModel();
  const downloaded = useModels((s) =>
    model ? s.downloadedChatIds.includes(model.id) : false
  );
  return (
    <View
      testID="vision-model-card"
      className="gap-2.5 rounded-[20px] bg-surface p-3.5"
    >
      <Text className="text-[14px] leading-[20px] text-foreground">
        {model
          ? t('chat.vision.offer', {
              current: currentName,
              model: model.name,
              size: formatBytes(totalBytes(model)),
            })
          : t('chat.vision.unsupported', { current: currentName })}
      </Text>
      {model ? (
        downloaded ? (
          <ProgressButton
            testID="vision-use"
            label={t('chat.vision.use', { model: model.name })}
            onPress={() => onUse(model.id)}
          />
        ) : (
          <ModelDownloadButton
            model={model}
            onStartChat={() => onUse(model.id)}
            testID="vision-download"
          />
        )
      ) : null}
    </View>
  );
}
