import * as Network from 'expo-network';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSheetIOS, Alert } from 'react-native';

import { getModels } from '@/features/services';
import { getSettings } from '@/features/settings/settings-store';
import { formatBytes } from '@/lib/format';

import { MullFiles } from '../../../modules/mull-files';
import type { CatalogModel } from './catalog-schema';

/** Free space needed before a download starts: the file plus 10%. */
export function requiredFreeBytes(model: Pick<CatalogModel, 'sizeBytes'>) {
  return Math.ceil(model.sizeBytes * 1.1);
}

/**
 * Starts a download after the pre-flight checks: enough free space, and a
 * confirmation when on cellular without "download over cellular" enabled.
 * Resolves true when the download was queued.
 */
export function useStartDownload() {
  const { t } = useTranslation();

  return useCallback(
    async (model: CatalogModel): Promise<boolean> => {
      const { free } = await MullFiles.diskSpace();
      const needed = requiredFreeBytes(model);
      if (free < needed) {
        Alert.alert(
          t('downloads.not_enough_space_title'),
          t('downloads.not_enough_space', { size: formatBytes(needed - free) })
        );
        return false;
      }

      const network = await Network.getNetworkStateAsync().catch(() => null);
      const onCellular = network?.type === Network.NetworkStateType.CELLULAR;
      if (!onCellular || getSettings().allowCellular) {
        getModels().download(model.id);
        return true;
      }

      return new Promise((resolve) => {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            title: t('downloads.cellular_title'),
            message: t('downloads.cellular_body', {
              size: formatBytes(model.sizeBytes),
            }),
            options: [t('downloads.cellular_allow'), t('common.cancel')],
            cancelButtonIndex: 1,
          },
          (index) => {
            if (index !== 0) return resolve(false);
            // Allowed for this download only; the setting stops the question.
            getModels().download(model.id);
            resolve(true);
          }
        );
      });
    },
    [t]
  );
}
