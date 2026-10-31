export type ChatRole = 'system' | 'user' | 'assistant';

/** Part of a message: text, or an image file on the device. */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; path: string };

export type ChatMessage = { role: ChatRole; content: string | ContentPart[] };

/** The text of a message, without its images. */
export function messageText(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n');
}

/** Image paths in a message, in order. */
export function messageImages(content: ChatMessage['content']): string[] {
  if (typeof content === 'string') return [];
  return content.flatMap((part) => (part.type === 'image' ? [part.path] : []));
}

export type SamplingParams = {
  temperature: number;
  topP: number;
  minP: number;
  repeatPenalty: number;
  /** Upper bound on new tokens for one answer. */
  maxTokens: number;
};

export type LoadOptions = {
  contextTokens: number;
  /** Ask Qwen3-style models to answer without a thinking block. */
  disableThinking?: boolean;
  /** Vision projector to load with the weights. */
  mmprojPath?: string;
  /** Upper bound on the tokens one image may cost. */
  imageMaxTokens?: number;
};

export type GenerateResult = {
  text: string;
  /** Tokens generated for this answer. */
  tokens: number;
  /** Milliseconds from the call to the first visible token; null if none came. */
  ttftMs: number | null;
  tokensPerSecond: number | null;
  /** True when stop() ended the answer early. */
  stopped: boolean;
};

export type TokenListener = (token: string) => void;

/**
 * The thin seam between Mull and an inference runtime. Callers must not call
 * `load`, `generate` or `unload` concurrently; the LLM store serialises them.
 * `stop` is the exception: it may be called at any time.
 */
export interface LlmEngine {
  readonly isLoaded: boolean;
  load(
    modelPath: string,
    options: LoadOptions,
    onProgress?: (fraction: number) => void
  ): Promise<void>;
  generate(
    messages: ChatMessage[],
    sampling: SamplingParams,
    onToken: TokenListener
  ): Promise<GenerateResult>;
  stop(): Promise<void>;
  /** Waits for any running generation to finish before releasing memory. */
  unload(): Promise<void>;
  /** Tokens a prompt fragment costs, images included. */
  countTokens?(text: string, imagePaths?: string[]): Promise<number>;
}

/**
 * A second, small model that turns passages into vectors for document
 * search. Like `LlmEngine`, calls must not overlap; the LLM store queues them.
 */
export interface EmbeddingEngine {
  readonly isLoaded: boolean;
  load(modelPath: string, contextTokens: number): Promise<void>;
  /** A unit-length vector for `text`. */
  embed(text: string): Promise<number[]>;
  unload(): Promise<void>;
}

export class EngineNotLoadedError extends Error {
  constructor() {
    super('No model is loaded');
    this.name = 'EngineNotLoadedError';
  }
}
