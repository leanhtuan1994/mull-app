export type ChatRole = 'system' | 'user' | 'assistant';

export type ChatMessage = { role: ChatRole; content: string };

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
  countTokens?(text: string): Promise<number>;
}

export class EngineNotLoadedError extends Error {
  constructor() {
    super('No model is loaded');
    this.name = 'EngineNotLoadedError';
  }
}
