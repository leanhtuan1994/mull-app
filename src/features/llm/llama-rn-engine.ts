import * as Device from 'expo-device';
import { initLlama, type LlamaContext } from 'llama.rn';

import {
  type ChatMessage,
  type EmbeddingEngine,
  EngineNotLoadedError,
  type GenerateResult,
  type LlmEngine,
  type LoadOptions,
  type SamplingParams,
  type TokenListener,
} from './engine';
import { stripThinking } from './strip-thinking';

/** End-of-turn markers across the chat templates in the catalog. */
const STOP_WORDS = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<end_of_turn>',
  '<|endoftext|>',
];

/** llama.cpp on device. The simulator has no usable Metal, so it runs on CPU there. */
export class LlamaRnEngine implements LlmEngine {
  private context: LlamaContext | null = null;
  private running: Promise<unknown> | null = null;
  private stopRequested = false;
  private disableThinking = false;

  get isLoaded() {
    return this.context !== null;
  }

  async load(
    modelPath: string,
    options: LoadOptions,
    onProgress?: (f: number) => void
  ) {
    if (this.context) await this.unload();
    this.disableThinking = options.disableThinking ?? false;
    const context = await initLlama(
      {
        model: modelPath,
        n_ctx: options.contextTokens,
        n_gpu_layers: Device.isDevice ? 99 : 0,
        use_mlock: false,
        // Shifting the context would move image tokens out of place.
        ctx_shift: !options.mmprojPath,
      },
      (progress) => onProgress?.(progress / 100)
    );
    if (options.mmprojPath) {
      const ok = await context
        .initMultimodal({
          path: options.mmprojPath,
          use_gpu: Device.isDevice,
          image_max_tokens: options.imageMaxTokens,
        })
        .catch(() => false);
      if (!ok) {
        await context.release();
        throw new Error('Could not load the vision projector');
      }
    }
    this.context = context;
  }

  async generate(
    messages: ChatMessage[],
    sampling: SamplingParams,
    onToken: TokenListener
  ): Promise<GenerateResult> {
    const context = this.context;
    if (!context) throw new EngineNotLoadedError();

    this.stopRequested = false;
    const started = Date.now();
    let ttftMs: number | null = null;
    let streamed = '';
    let emitted = 0;

    const completion = context.completion(
      {
        messages: messages.map(toLlamaMessage),
        n_predict: sampling.maxTokens,
        temperature: sampling.temperature,
        top_p: sampling.topP,
        min_p: sampling.minP,
        penalty_repeat: sampling.repeatPenalty,
        stop: STOP_WORDS,
        enable_thinking: !this.disableThinking,
      },
      (data) => {
        // A stop that arrived while llama.rn was still formatting the prompt
        // was a no-op natively; repeat it now that generation runs.
        if (this.stopRequested) void context.stopCompletion();
        streamed += data.token;
        // Hide a thinking block from the stream; only emit visible text.
        const visible = stripThinking(streamed);
        if (visible.length > emitted) {
          if (ttftMs === null) ttftMs = Date.now() - started;
          onToken(visible.slice(emitted));
          emitted = visible.length;
        }
      }
    );
    this.running = completion;
    try {
      const result = await completion;
      return {
        text: stripThinking(result.text).trim(),
        tokens: result.tokens_predicted,
        ttftMs,
        tokensPerSecond: result.timings?.predicted_per_second ?? null,
        stopped: this.stopRequested || result.interrupted,
      };
    } finally {
      this.running = null;
    }
  }

  async stop() {
    if (!this.context || !this.running) return;
    this.stopRequested = true;
    await this.context.stopCompletion();
  }

  async unload() {
    const context = this.context;
    if (!context) return;
    // Releasing while native generation runs crashes the app, so stop it and
    // wait for it to settle first.
    if (this.running) {
      await context.stopCompletion().catch(() => undefined);
      await this.running.catch(() => undefined);
    }
    this.context = null;
    await context.release();
  }

  async countTokens(text: string, imagePaths: string[] = []) {
    if (!this.context) throw new EngineNotLoadedError();
    const markers = imagePaths.map(() => MEDIA_MARKER).join(' ');
    const { tokens } = await this.context.tokenize(
      markers ? `${markers} ${text}` : text,
      { media_paths: imagePaths.map(fileUrl) }
    );
    return tokens.length;
  }
}

/** Where llama.cpp puts an image in a tokenized prompt. */
const MEDIA_MARKER = '<__media__>';

const fileUrl = (path: string) =>
  path.startsWith('file://') ? path : `file://${path}`;

/** Mull's message parts in the OpenAI-style shape llama.rn reads. */
function toLlamaMessage(message: ChatMessage) {
  if (typeof message.content === 'string') return message;
  return {
    role: message.role,
    content: message.content.map((part) =>
      part.type === 'text'
        ? { type: 'text', text: part.text }
        : { type: 'image_url', image_url: { url: fileUrl(part.path) } }
    ),
  };
}

/**
 * Batch size larger than any passage: embedding models are not causal, so a
 * whole passage must fit one batch. Passages are capped at 1200 characters.
 */
const EMBEDDING_BATCH = 1024;

/** A small embedding GGUF on its own llama.cpp context. */
export class LlamaRnEmbeddingEngine implements EmbeddingEngine {
  private context: LlamaContext | null = null;

  get isLoaded() {
    return this.context !== null;
  }

  async load(modelPath: string, contextTokens: number) {
    if (this.context) await this.unload();
    this.context = await initLlama({
      model: modelPath,
      embedding: true,
      n_ctx: contextTokens,
      n_batch: EMBEDDING_BATCH,
      n_ubatch: EMBEDDING_BATCH,
      n_gpu_layers: Device.isDevice ? 99 : 0,
      use_mlock: false,
    });
  }

  async embed(text: string) {
    if (!this.context) throw new EngineNotLoadedError();
    // embd_normalize 2: Euclidean, so cosine similarity is a dot product.
    const { embedding } = await this.context.embedding(text, {
      embd_normalize: 2,
    });
    return embedding;
  }

  async unload() {
    const context = this.context;
    this.context = null;
    await context?.release();
  }
}
