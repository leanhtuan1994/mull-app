import type { ChatMessage } from '@/features/llm/engine';

import { estimateTokens, MESSAGE_OVERHEAD_TOKENS } from './token-estimate';

export type ResponseLength = 'short' | 'medium' | 'long';

export const RESPONSE_LENGTH_TOKENS: Record<ResponseLength, number> = {
  short: 256,
  medium: 512,
  long: 1024,
};

/** Room kept for the answer: the response length, but never under 25% of the context or 256 tokens. */
export function reserveTokens(
  contextTokens: number,
  maxNewTokens: number
): number {
  return Math.max(maxNewTokens, Math.max(256, Math.ceil(contextTokens * 0.25)));
}

export type BuildPromptInput = {
  /** The catalog model's own prompt, placed before the user's. */
  modelSystemPrompt?: string;
  /** The prompt saved on the chat when it was created. */
  chatSystemPrompt?: string;
  /** Oldest first; the last entry is the message being answered. */
  history: ChatMessage[];
  contextTokens: number;
  maxNewTokens: number;
  countTokens?: (text: string) => number;
};

export type BuiltPrompt = {
  messages: ChatMessage[];
  /** True when older messages were left out to fit the context window. */
  trimmed: boolean;
  promptTokens: number;
};

export function joinSystemPrompts(...prompts: (string | undefined)[]): string {
  return prompts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * System prompt first, then as many of the newest messages as fit in
 * `contextTokens - reserve`. The newest message is always kept.
 */
export function buildPrompt({
  modelSystemPrompt,
  chatSystemPrompt,
  history,
  contextTokens,
  maxNewTokens,
  countTokens = estimateTokens,
}: BuildPromptInput): BuiltPrompt {
  const cost = (m: ChatMessage) =>
    countTokens(m.content) + MESSAGE_OVERHEAD_TOKENS;
  const budget = contextTokens - reserveTokens(contextTokens, maxNewTokens);

  const system = joinSystemPrompts(modelSystemPrompt, chatSystemPrompt);
  const systemMessage: ChatMessage | null = system
    ? { role: 'system', content: system }
    : null;
  let used = systemMessage ? cost(systemMessage) : 0;

  const kept: ChatMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    const next = cost(message);
    if (kept.length > 0 && used + next > budget) break;
    kept.unshift(message);
    used += next;
  }

  // Chat templates expect the conversation to open with a user turn.
  while (kept.length > 1 && kept[0].role !== 'user') kept.shift();

  return {
    messages: systemMessage ? [systemMessage, ...kept] : kept,
    trimmed: kept.length < history.length,
    promptTokens: used,
  };
}
