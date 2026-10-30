import { createStore } from 'zustand/vanilla';

import type {
  ChatMessage,
  GenerateResult,
  LlmEngine,
  SamplingParams,
  TokenListener,
} from './engine';
import { createSerialQueue } from './serial-queue';

export type LlmStatus = 'idle' | 'loading' | 'ready' | 'generating' | 'error';

export type LlmErrorKind = 'load' | 'memory';

export type LoadableModel = {
  id: string;
  path: string;
  contextTokens: number;
  disableThinking?: boolean;
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
export function createLlmStore(engine: LlmEngine) {
  const queue = createSerialQueue();
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

  function ensureLoaded(model: LoadableModel): Promise<void> {
    return queue.run(async () => {
      const { loadedModelId } = store.getState();
      if (loadedModelId === model.id && engine.isLoaded) return;
      await unloadNow();
      set({ status: 'loading', loadProgress: 0, error: null });
      try {
        await engine.load(
          model.path,
          {
            contextTokens: model.contextTokens,
            disableThinking: model.disableThinking,
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

  function unload(): Promise<void> {
    return queue.run(unloadNow);
  }

  /** iOS warned that memory is low: stop any answer and release the model. */
  async function handleMemoryWarning() {
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
    countTokens: engine.countTokens?.bind(engine),
  };
}

export type LlmController = ReturnType<typeof createLlmStore>;
