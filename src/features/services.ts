import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { useStore } from 'zustand';

import { getRepos, openDatabase } from '@/db/client';
import { createAttachmentFiles } from '@/features/attachments/attachment-files';
import { buildDocumentContext } from '@/features/attachments/document-context';
import { createIngest } from '@/features/attachments/ingest';
import { notifyChatsChanged } from '@/features/chat/chat-list-store';
import { type ChatState, createChatStore } from '@/features/chat/chat-store';
import { MARKDOWN_SAMPLE } from '@/features/chat/markdown-sample';
import {
  type ChatMessage,
  type EmbeddingEngine,
  type LlmEngine,
  messageText,
} from '@/features/llm/engine';
import {
  LlamaRnEmbeddingEngine,
  LlamaRnEngine,
} from '@/features/llm/llama-rn-engine';
import { createLlmStore, type LlmState } from '@/features/llm/llm-store';
import {
  DEFAULT_REPLY,
  MockEmbeddingEngine,
  MockEngine,
} from '@/features/llm/mock-engine';
import {
  findCatalogModel,
  getCatalogModels,
  loadCatalog,
} from '@/features/models/catalog';
import { memoryBudgetGB, modelCostGB } from '@/features/models/compatibility';
import { createBackgroundTransport } from '@/features/models/downloader';
import {
  createModelStore,
  type ModelController,
  type ModelStoreState,
} from '@/features/models/model-store';
import { getDeviceInfo } from '@/features/models/use-device-info';
import { BUILT_IN_PRESETS } from '@/features/prompts/built-in-presets';
import { getSettings } from '@/features/settings/settings-store';

import { MullFiles } from '../../modules/mull-files';

/**
 * `EXPO_PUBLIC_MULL_ENGINE=mock` swaps llama.cpp for a scripted engine, so
 * UI work and E2E runs on the simulator do not wait on CPU inference.
 */
export const isMockEngine = process.env.EXPO_PUBLIC_MULL_ENGINE === 'mock';

/** Asking about markdown, code, tables or formulas gets the rich sample. */
function mockReply(messages: ChatMessage[]): string {
  const last = messageText(
    messages.findLast((m) => m.role === 'user')?.content ?? ''
  );
  return /markdown|code|bảng|công thức/i.test(last)
    ? MARKDOWN_SAMPLE
    : DEFAULT_REPLY;
}

const engine: LlmEngine = isMockEngine
  ? new MockEngine({
      tokenDelayMs: 80,
      prefillDelayMs: 400,
      loadDelayMs: 700,
      reply: mockReply,
    })
  : new LlamaRnEngine();

const embedder: EmbeddingEngine = isMockEngine
  ? new MockEmbeddingEngine({ delayMs: 20 })
  : new LlamaRnEmbeddingEngine();

/** Both models stay loaded only when their combined cost fits the RAM budget. */
function fitsTogether(chatModelId: string, embeddingModelId: string) {
  const chatModel = findCatalogModel(chatModelId);
  const embeddingModel = findCatalogModel(embeddingModelId);
  if (!chatModel || !embeddingModel) return false;
  return (
    modelCostGB(chatModel) + modelCostGB(embeddingModel) <=
    memoryBudgetGB(getDeviceInfo().totalBytes)
  );
}

export const llm = createLlmStore(engine, { embedder, fitsTogether });

let models: ModelController | null = null;

/** The download and model-file controller; available once `bootstrap` ran. */
export function getModels(): ModelController {
  if (!models) throw new Error('Model store is not ready yet');
  return models;
}

export const attachments = createAttachmentFiles({
  repos: getRepos,
  files: MullFiles,
  newId: () => Crypto.randomUUID(),
});

/** The downloaded embedding model, if any, with what llama.rn needs. */
function embeddingModel() {
  const ids = models?.store.getState().downloadedIds ?? [];
  const model = getCatalogModels().find(
    (m) => m.kind === 'embedding' && ids.includes(m.id)
  );
  const path = model && models?.store.getState().paths[model.id];
  if (!model?.embedding || !path) return null;
  return {
    id: model.id,
    path,
    contextTokens: model.contextTokens,
    queryPrefix: model.embedding.queryPrefix,
    documentPrefix: model.embedding.documentPrefix,
  };
}

export const ingest = createIngest({
  repos: getRepos,
  files: MullFiles,
  llm,
  absolute: (relative) => attachments.absolute(relative),
  embeddingModel,
  isActive: () => AppState.currentState === 'active',
});

async function documentContext(input: {
  chatId: number;
  question: string;
  previousQuestion?: string;
  budgetTokens: number;
}) {
  const repos = getRepos();
  // A document attached just now may still be read; wait for its passages.
  const sent = await repos.attachments.listByChat(input.chatId);
  await ingest.whenExtracted(
    sent.filter((a) => a.status === 'extracting').map((a) => a.id)
  );
  const chunks = await repos.chunks.listForChat(input.chatId);
  if (chunks.length === 0) return null;
  const names = new Map(sent.map((a) => [a.id, a.name]));
  return buildDocumentContext({
    chunks,
    names,
    question: input.question,
    previousQuestion: input.previousQuestion,
    budgetTokens: input.budgetTokens,
    embedQuery: async (question) => {
      const model = embeddingModel();
      if (!model) return null;
      const [vector] = await llm.embed(
        model,
        [`${model.queryPrefix}${question}`],
        { priority: 'normal' }
      );
      return vector;
    },
  });
}

export const chat = createChatStore({
  repos: getRepos,
  llm,
  findModel: (id) => findCatalogModel(id),
  modelPath: (id) => models?.store.getState().paths[id],
  mmprojPath: (id) => models?.mmprojPath(id),
  attachmentPath: (relative) => attachments.absolute(relative),
  settings: getSettings,
  scheduleFrame: (callback) => requestAnimationFrame(callback),
  onChatsChanged: notifyChatsChanged,
  attachDrafts: (ids, target) => attachments.attachDrafts(ids, target),
  documentContext,
});

let booting: Promise<void> | null = null;

/** Opens the database, seeds presets, syncs the catalog and reconciles model files. */
export function bootstrap(): Promise<void> {
  booting ??= (async () => {
    const repos = await openDatabase();
    const catalog = loadCatalog();
    await repos.models.syncCatalog(catalog.models, catalog.catalogVersion);
    await repos.presets.seed(BUILT_IN_PRESETS);
    await attachments.init();

    const transport = createBackgroundTransport();
    models = createModelStore({
      repo: repos.models,
      files: MullFiles,
      transport,
      catalog: getCatalogModels,
    });
    await models.init();

    syncDefaultModel(models.store.getState().downloadedChatIds);
    models.store.subscribe((state, previous) => {
      if (state.downloadedChatIds !== previous.downloadedChatIds) {
        syncDefaultModel(state.downloadedChatIds);
      }
      // A new embedding model indexes the documents already attached.
      if (state.downloadedIds !== previous.downloadedIds) void ingest.resume();
    });
    // Documents left mid-way when Mull last closed.
    void ingest.resume();
  })();
  return booting;
}

/** Keeps the default model pointing at a chat model that is on the device. */
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

/** Deletes a chat with its attached files. */
export async function deleteChat(chatId: number) {
  await getRepos().chats.remove(chatId);
  await attachments.removeChatFiles(chatId);
}

/** Deletes every chat and every attached file. */
export async function deleteAllChats() {
  await getRepos().chats.removeAll();
  await attachments.removeAllFiles();
}
