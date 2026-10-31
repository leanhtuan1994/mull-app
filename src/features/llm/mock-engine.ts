import { normalizeVi } from '@/lib/normalize-vi';

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

export const DEFAULT_REPLY =
  'Đây là câu trả lời mẫu từ engine giả lập của Mull. Mọi thứ được tạo ngay trên máy, ' +
  'nên tin nhắn của bạn không rời khỏi iPhone.\n\n' +
  '- Engine giả lập dùng cho simulator và cho test.\n' +
  '- Nó phát lại từng token với độ trễ cố định, và dừng được bất cứ lúc nào.\n\n' +
  'Câu trả lời này cố ý dài hơn một chút để có đủ thời gian thử nút dừng, ' +
  'kiểm tra việc cuộn theo câu trả lời và xem chỉ số tốc độ ở cuối tin nhắn. ' +
  'Khi dùng model thật, phần này được thay bằng câu trả lời do llama.cpp tạo ra.';

export type MockEngineOptions = {
  /** Delay between tokens, in milliseconds. */
  tokenDelayMs?: number;
  /** Delay before the first token, standing in for prompt prefill. */
  prefillDelayMs?: number;
  loadDelayMs?: number;
  reply?: string | ((messages: ChatMessage[]) => string);
  failLoad?: boolean;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Splits text into word-and-space pieces, a stand-in for real tokens. */
export function mockTokenize(text: string): string[] {
  return text.match(/\s*\S+/g) ?? [];
}

/**
 * Replays a fixed reply token by token. Used by Jest and by the UI when no
 * real model is available (for example `EXPO_PUBLIC_MULL_ENGINE=mock`).
 */
export class MockEngine implements LlmEngine {
  private loadedPath: string | null = null;
  private stopRequested = false;
  private running: Promise<GenerateResult> | null = null;
  readonly calls: { sampling: SamplingParams; messages: ChatMessage[] }[] = [];
  readonly events: string[] = [];

  constructor(private readonly options: MockEngineOptions = {}) {}

  get isLoaded() {
    return this.loadedPath !== null;
  }

  get modelPath() {
    return this.loadedPath;
  }

  async load(
    modelPath: string,
    _options: LoadOptions,
    onProgress?: (f: number) => void
  ) {
    this.events.push(`load:${modelPath}`);
    if (this.options.failLoad) throw new Error('Mock load failure');
    const delay = this.options.loadDelayMs ?? 0;
    onProgress?.(0);
    await sleep(delay / 2);
    onProgress?.(0.5);
    await sleep(delay / 2);
    onProgress?.(1);
    this.loadedPath = modelPath;
  }

  async generate(
    messages: ChatMessage[],
    sampling: SamplingParams,
    onToken: TokenListener
  ): Promise<GenerateResult> {
    if (!this.loadedPath) throw new EngineNotLoadedError();
    this.calls.push({ sampling, messages });
    this.stopRequested = false;
    this.running = this.run(messages, sampling, onToken);
    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  private async run(
    messages: ChatMessage[],
    sampling: SamplingParams,
    onToken: TokenListener
  ): Promise<GenerateResult> {
    this.events.push('generate:start');
    const started = Date.now();
    const reply =
      typeof this.options.reply === 'function'
        ? this.options.reply(messages)
        : (this.options.reply ?? DEFAULT_REPLY);
    const pieces = mockTokenize(reply).slice(0, sampling.maxTokens);

    await sleep(this.options.prefillDelayMs ?? 0);
    let text = '';
    let ttftMs: number | null = null;
    let tokens = 0;
    for (const piece of pieces) {
      if (this.stopRequested) break;
      if (ttftMs === null) ttftMs = Date.now() - started;
      text += piece;
      tokens += 1;
      onToken(piece);
      await sleep(this.options.tokenDelayMs ?? 0);
    }
    const seconds = (Date.now() - started - (ttftMs ?? 0)) / 1000;
    this.events.push('generate:end');
    return {
      text,
      tokens,
      ttftMs,
      tokensPerSecond: tokens > 0 && seconds > 0 ? tokens / seconds : null,
      stopped: this.stopRequested,
    };
  }

  async stop() {
    this.stopRequested = true;
  }

  async unload() {
    // Mirror the real engine: never release while a generation is running.
    if (this.running) await this.running.catch(() => undefined);
    this.events.push('unload');
    this.loadedPath = null;
  }

  async countTokens(text: string, imagePaths: string[] = []) {
    return mockTokenize(text).length + imagePaths.length * MOCK_IMAGE_TOKENS;
  }
}

/** What one image costs in the mock engine's token counts. */
export const MOCK_IMAGE_TOKENS = 64;

const MOCK_DIMENSIONS = 64;

/**
 * Hashes each accent-folded word into a fixed-size bag of words, so passages
 * that share words with a question score higher, as with a real model.
 */
export function mockEmbedding(text: string): number[] {
  const vector = new Array<number>(MOCK_DIMENSIONS).fill(0);
  for (const word of normalizeVi(text).split(/[^\p{L}\p{N}]+/u)) {
    if (word.length < 2) continue;
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    vector[hash % MOCK_DIMENSIONS] += 1;
  }
  const length = Math.hypot(...vector) || 1;
  return vector.map((v) => v / length);
}

export class MockEmbeddingEngine implements EmbeddingEngine {
  private loadedPath: string | null = null;
  readonly events: string[] = [];

  constructor(private readonly options: { delayMs?: number } = {}) {}

  get isLoaded() {
    return this.loadedPath !== null;
  }

  async load(modelPath: string) {
    this.events.push(`load:${modelPath}`);
    this.loadedPath = modelPath;
  }

  async embed(text: string) {
    if (!this.loadedPath) throw new EngineNotLoadedError();
    this.events.push('embed');
    await sleep(this.options.delayMs ?? 0);
    return mockEmbedding(text);
  }

  async unload() {
    this.events.push('unload');
    this.loadedPath = null;
  }
}
