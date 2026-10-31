import { findCatalogModel } from '@/features/models/catalog';
import { useChat, useModels } from '@/features/services';
import { useSettings } from '@/features/settings/settings-store';

/** The model the open chat answers with: its own, else the default, if on the device. */
export function useActiveModel() {
  const modelId = useChat((s) => s.modelId);
  const defaultModelId = useSettings((s) => s.defaultModelId);
  const downloadedIds = useModels((s) => s.downloadedChatIds);
  for (const id of [modelId, defaultModelId]) {
    if (id && downloadedIds.includes(id)) return findCatalogModel(id);
  }
  return undefined;
}
