import type { ChatMessage } from '@/features/llm/engine';

import {
  buildPrompt,
  joinSystemPrompts,
  reserveTokens,
  RESPONSE_LENGTH_TOKENS,
} from './context-budget';
import { estimateTokens } from './token-estimate';

describe('estimateTokens', () => {
  it('counts Vietnamese with diacritics at twice the ASCII rate', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('ượng')).toBe(2); // ư ợ are 0.5 each, n g are 0.25
    expect(estimateTokens('Xin chào')).toBe(3);
  });

  it('counts CJK at one token per character', () => {
    expect(estimateTokens('你好世界')).toBe(4);
  });

  it('is zero for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('reserveTokens', () => {
  it('keeps at least 25% of the context', () => {
    expect(reserveTokens(2048, RESPONSE_LENGTH_TOKENS.short)).toBe(512);
  });
  it('keeps at least 256 tokens', () => {
    expect(reserveTokens(512, 100)).toBe(256);
  });
  it('follows a long response length', () => {
    expect(reserveTokens(2048, RESPONSE_LENGTH_TOKENS.long)).toBe(1024);
  });
});

const turn = (role: ChatMessage['role'], content: string): ChatMessage => ({
  role,
  content,
});

describe('buildPrompt', () => {
  it('puts the model prompt before the chat prompt', () => {
    expect(joinSystemPrompts(' Model ', undefined, 'Chat')).toBe(
      'Model\n\nChat'
    );
    const { messages } = buildPrompt({
      modelSystemPrompt: 'Model rules',
      chatSystemPrompt: 'Be brief',
      history: [turn('user', 'Chào')],
      contextTokens: 2048,
      maxNewTokens: 512,
    });
    expect(messages[0]).toEqual({
      role: 'system',
      content: 'Model rules\n\nBe brief',
    });
    expect(messages[1]).toEqual(turn('user', 'Chào'));
  });

  it('keeps short conversations whole', () => {
    const history = [
      turn('user', 'Một'),
      turn('assistant', 'Hai'),
      turn('user', 'Ba'),
    ];
    const result = buildPrompt({
      history,
      contextTokens: 2048,
      maxNewTokens: 512,
    });
    expect(result.trimmed).toBe(false);
    expect(result.messages).toEqual(history);
  });

  it('drops the oldest Vietnamese turns first when the history is long', () => {
    // ~100 tokens per turn of accented Vietnamese.
    const long = 'Lượng tử hoá giảm số bit của trọng số. '.repeat(10);
    const history: ChatMessage[] = [];
    for (let i = 0; i < 40; i++) {
      history.push(turn(i % 2 ? 'assistant' : 'user', `${i}: ${long}`));
    }
    const result = buildPrompt({
      chatSystemPrompt: 'Trợ lý hữu ích',
      history,
      contextTokens: 2048,
      maxNewTokens: 512,
    });
    expect(result.trimmed).toBe(true);
    expect(result.promptTokens).toBeLessThanOrEqual(2048 - 512);
    const kept = result.messages.slice(1);
    expect(kept[kept.length - 1]).toBe(history[history.length - 1]);
    expect(kept[0].role).toBe('user');
  });

  it('always keeps the newest message even if it alone is too long', () => {
    const huge = turn('user', 'x'.repeat(20000));
    const result = buildPrompt({
      history: [turn('user', 'old'), turn('assistant', 'reply'), huge],
      contextTokens: 2048,
      maxNewTokens: 512,
    });
    expect(result.messages).toEqual([huge]);
    expect(result.trimmed).toBe(true);
  });

  it('uses the engine count when given one', () => {
    const result = buildPrompt({
      history: [turn('user', 'a'), turn('assistant', 'b'), turn('user', 'c')],
      contextTokens: 1024,
      maxNewTokens: 256,
      countTokens: () => 300,
    });
    // Budget 768; each message costs 304, so only two fit, and the history
    // must open with a user turn.
    expect(result.messages).toEqual([turn('user', 'c')]);
  });
});
