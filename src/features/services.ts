import { useStore } from 'zustand';

import { getRepos, openDatabase } from '@/db/client';
import { notifyChatsChanged } from '@/features/chat/chat-list-store';
import { type ChatState, createChatStore } from '@/features/chat/chat-store';
import type { LlmEngine } from '@/features/llm/engine';
import { LlamaRnEngine } from '@/features/llm/llama-rn-engine';
import { createLlmStore, type LlmState } from '@/features/llm/llm-store';
import { MockEngine } from '@/features/llm/mock-engine';
import {
  findCatalogModel,
  getCatalogModels,
  loadCatalog,
} from '@/features/models/catalog';
import { createBackgroundTransport } from '@/features/models/downloader';
import {
  createModelStore,
  type ModelController,
  type ModelStoreState,
} from '@/features/models/model-store';
import { BUILT_IN_PRESETS } from '@/features/prompts/built-in-presets';
import { getSettings } from '@/features/settings/settings-store';

import { MullFiles } from '../../modules/mull-files';

/**
 * `EXPO_PUBLIC_MULL_ENGINE=mock` swaps llama.cpp for a scripted engine, so
 * UI work and E2E runs on the simulator do not wait on CPU inference.
 */
export const isMockEngine = process.env.EXPO_PUBLIC_MULL_ENGINE === 'mock';

const engine: LlmEngine = isMockEngine
  ? new MockEngine({ tokenDelayMs: 80, prefillDelayMs: 400, loadDelayMs: 700 })
  : new LlamaRnEngine();

export const llm = createLlmStore(engine);

let models: ModelController | null = null;

/** The download and model-file controller; available once `bootstrap` ran. */
export function getModels(): ModelController {
  if (!models) throw new Error('Model store is not ready yet');
  return models;
}

export const chat = createChatStore({
  repos: getRepos,
  llm,
  findModel: (id) => findCatalogModel(id),
  modelPath: (id) => models?.store.getState().paths[id],
  settings: getSettings,
  scheduleFrame: (callback) => requestAnimationFrame(callback),
  onChatsChanged: notifyChatsChanged,
});

let booting: Promise<void> | null = null;

/** Opens the database, seeds presets, syncs the catalog and reconciles model files. */
export function bootstrap(): Promise<void> {
  booting ??= (async () => {
    const repos = await openDatabase();
    const catalog = loadCatalog();
    await repos.models.syncCatalog(catalog.models, catalog.catalogVersion);
    await repos.presets.seed(BUILT_IN_PRESETS);

    const transport = createBackgroundTransport();
    models = createModelStore({
      repo: repos.models,
      files: MullFiles,
      transport,
      catalog: getCatalogModels,
    });
    await models.init();

    syncDefaultModel(models.store.getState().downloadedIds);
    models.store.subscribe((state, previous) => {
      if (state.downloadedIds !== previous.downloadedIds) {
        syncDefaultModel(state.downloadedIds);
      }
    });
  })();
  return booting;
}

/** Keeps the default model pointing at something that is on the device. */
function syncDefaultModel(downloadedIds: string[]) {
  const { defaultModelId, update } = getSettings();
  if (!defaultModelId || !downloadedIds.includes(defaultModelId)) {
    update({
      defaultModelId: downloadedIds[downloadedIds.length - 1] ?? null,
    });
  }
}

export function useLlm<T>(selector: (state: LlmState) => T): T {
  return useStore(llm.store, selector);
}

export function useChat<T>(selector: (state: ChatState) => T): T {
  return useStore(chat.store, selector);
}

export function useModels<T>(selector: (state: ModelStoreState) => T): T {
  return useStore(getModels().store, selector);
}
