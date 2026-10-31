import { createStore } from 'zustand/vanilla';

import type {
  ChatMessage,
  EmbeddingEngine,
  GenerateResult,
  LlmEngine,
  SamplingParams,
  TokenListener,
} from './engine';
import { createSerialQueue, type QueuePriority } from './serial-queue';

export type LlmStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export type LlmErrorKind = 'load' | 'memory';

export type LoadableModel = {
  id: string;
  path: string;
  contextTokens: number;
  disableThinking?: boolean;
  mmprojPath?: string;
  imageMaxTokens?: number;
};

export type EmbeddingModel = {
  id: string;
  path: string;
  contextTokens: number;
};

type LlmStoreOptions = {
  embedder?: EmbeddingEngine;
  /**
   * Whether a chat model and an embedding model fit in memory together.
   * When they do not, one is released before the other loads.
   */
  fitsTogether?: (chatModelId: string, embeddingModelId: string) => boolean;
};

export type LlmState = {
  status: LlmStatus;
  loadedModelId: string | null;
  loadProgress: number;
  error: { kind: LlmErrorKind; modelId: string | null; message: string } | null;
};

const STOPPED_BEFORE_START: GenerateResult = {
  text: '',
  tokens: 0,
  ttftMs: null,
  tokensPerSecond: null,
  stopped: true,
};

const WARM_UP_SAMPLING: SamplingParams = {
  temperature: 0,
  topP: 1,
  minP: 0,
  repeatPenalty: 1,
  maxTokens: 1,
};

/**
 * Owns the one loaded model. Load, warm-up, generate and unload run through
 * a serial queue, so a model is never released while it is generating.
 * `stop` skips the queue so it takes effect at once.
 */
/** An embedding batch that was dropped because it should no longer run. */
export class EmbeddingSkippedError extends Error {
  constructor() {
    super('Embedding skipped');
    this.name = 'EmbeddingSkippedError';
  }
}

export function createLlmStore(
  engine: LlmEngine,
  { embedder, fitsTogether = () => true }: LlmStoreOptions = {}
) {
  const queue = createSerialQueue();
  let embeddingModelId: string | null = null;
  let generationTicket = 0;
  let cancelledThrough = 0;
  let generating = false;
  let warmingUp = false;

  const store = createStore<LlmState>()(() => ({
    status: 'idle',
    loadedModelId: null,
    loadProgress: 0,
    error: null,
  }));

  const set = (patch: Partial<LlmState>) => store.setState(patch);

  async function unloadNow() {
    if (!engine.isLoaded) return;
    await engine.unload();
    set({ loadedModelId: null, status: 'idle' });
  }

  async function unloadEmbedderNow() {
    if (!embedder?.isLoaded) return;
    await embedder.unload();
    embeddingModelId = null;
  }

  /** The chat model answers are for; generate reloads it if it was released. */
  let wanted: LoadableModel | null = null;

  /** Loads `model` unless it already is. Runs inside a queued task. */
  async function loadNow(model: LoadableModel) {
    const { loadedModelId } = store.getState();
    if (loadedModelId === model.id && engine.isLoaded) return false;
    await unloadNow();
    if (embeddingModelId && !fitsTogether(model.id, embeddingModelId))
      await unloadEmbedderNow();
    set({ status: 'loading', loadProgress: 0, error: null });
    try {
      await engine.load(
        model.path,
        {
          contextTokens: model.contextTokens,
          disableThinking: model.disableThinking,
          mmprojPath: model.mmprojPath,
          imageMaxTokens: model.imageMaxTokens,
        },
        (fraction) => set({ loadProgress: fraction })
      );
    } catch (error) {
      set({
        status: 'error',
        loadedModelId: null,
        error: { kind: 'load', modelId: model.id, message: String(error) },
      });
      throw error;
    }
    set({ status: 'ready', loadedModelId: model.id, loadProgress: 1 });
    return true;
  }

  function ensureLoaded(model: LoadableModel): Promise<void> {
    wanted = model;
    return queue.run(async () => {
      if (!(await loadNow(model))) return;
      // Run one token in the background so the first real answer starts faster.
      void queue.run(async () => {
        if (store.getState().loadedModelId !== model.id) return;
        warmingUp = true;
        try {
          await engine.generate(
            [{ role: 'user', content: 'Hi' }],
            WARM_UP_SAMPLING,
            () => {}
          );
        } catch {
          // A failed warm-up only costs speed.
        } finally {
          warmingUp = false;
        }
      });
    });
  }

  function generate(
    messages: ChatMessage[],
    sampling: SamplingParams,
    onToken: TokenListener
  ): Promise<GenerateResult> {
    const ticket = ++generationTicket;
    // Show the stop button while the request waits for a load or warm-up.
    set({ status: 'generating' });
    generating = true;
    return queue
      .run(async () => {
        if (ticket <= cancelledThrough) return STOPPED_BEFORE_START;
        // Something queued in between (for example the embedding model on a
        // phone where both do not fit) may have released the chat model;
        // load it again in this same task so nothing can slip in before
        // the answer.
        if (wanted) await loadNow(wanted);
        set({ status: 'generating' });
        return engine.generate(messages, sampling, onToken);
      })
      .finally(() => {
        if (ticket !== generationTicket) return;
        generating = false;
        if (store.getState().status !== 'error') {
          set({ status: engine.isLoaded ? 'ready' : 'idle' });
        }
      });
  }

  async function stop() {
    cancelledThrough = generationTicket;
    if (warmingUp || generating) await engine.stop();
  }

  /** Releases both models, for example when Mull goes to the background. */
  function unload(): Promise<void> {
    return queue.run(async () => {
      await unloadNow();
      await unloadEmbedderNow();
    });
  }

  /**
   * Embeds passages with the embedding model, loading it first. Indexing
   * runs as background work, so a question asked meanwhile goes first;
   * callers send small batches to keep that wait short. A question's own
   * vector uses `normal` so it is not stuck behind indexing.
   */
  function embed(
    model: EmbeddingModel,
    texts: string[],
    {
      priority = 'background',
      shouldRun,
    }: {
      priority?: QueuePriority;
      /** Checked when the task starts; false skips it (for example in the background). */
      shouldRun?: () => boolean;
    } = {}
  ): Promise<number[][]> {
    if (!embedder) return Promise.reject(new Error('No embedding engine'));
    return queue.run(async () => {
      if (shouldRun && !shouldRun()) throw new EmbeddingSkippedError();
      if (embeddingModelId !== model.id || !embedder.isLoaded) {
        await unloadEmbedderNow();
        const { loadedModelId } = store.getState();
        if (loadedModelId && !fitsTogether(loadedModelId, model.id))
          await unloadNow();
        await embedder.load(model.path, model.contextTokens);
        embeddingModelId = model.id;
      }
      const vectors: number[][] = [];
      for (const text of texts) vectors.push(await embedder.embed(text));
      return vectors;
    }, priority);
  }

  /**
   * Tokens `text` costs with the loaded chat model, or null when none is
   * loaded. Queued, so it never touches a model that is being released.
   */
  function countTokens(text: string, imagePaths?: string[]) {
    return queue.run(async () => {
      if (!engine.isLoaded || !engine.countTokens) return null;
      return engine.countTokens(text, imagePaths);
    });
  }

  /**
   * iOS warned that memory is low. Release the embedding model first; only
   * when it is not loaded stop any answer and release the chat model.
   */
  async function handleMemoryWarning() {
    if (embedder?.isLoaded) {
      // Stop any answer so the release does not wait behind it.
      await stop();
      await queue.run(unloadEmbedderNow);
      return;
    }
    const { loadedModelId } = store.getState();
    if (!loadedModelId && !generating) return;
    await stop();
    await unload();
    set({
      status: 'error',
      error: {
        kind: 'memory',
        modelId: loadedModelId,
        message: 'memoryWarning',
      },
    });
  }

  return {
    store,
    ensureLoaded,
    generate,
    stop,
    unload,
    handleMemoryWarning,
    clearError: () =>
      set({ error: null, status: engine.isLoaded ? 'ready' : 'idle' }),
    isGenerating: () => generating,
    idle: () => queue.idle(),
    countTokens,
    embed,
    /** Something other than background work is queued or running. */
    hasPendingWork: () => queue.pendingNormal > 0,
  };
}

export type LlmController = ReturnType<typeof createLlmStore>;
