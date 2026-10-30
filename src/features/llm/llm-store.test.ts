import type { SamplingParams } from './engine';
import { createLlmStore } from './llm-store';
import { MockEngine } from './mock-engine';

const SAMPLING: SamplingParams = {
  temperature: 0.8,
  topP: 0.9,
  minP: 0,
  repeatPenalty: 1,
  maxTokens: 512,
};
const ASK = [{ role: 'user' as const, content: 'Xin chào' }];
const QWEN = { id: 'qwen', path: '/qwen.gguf', contextTokens: 2048 };
const GEMMA = { id: 'gemma', path: '/gemma.gguf', contextTokens: 2048 };

describe('llm store', () => {
  it('loads once, warms up, then answers', async () => {
    const engine = new MockEngine({ reply: 'chào bạn' });
    const llm = createLlmStore(engine);
    await llm.ensureLoaded(QWEN);
    await llm.ensureLoaded(QWEN);
    const result = await llm.generate(ASK, SAMPLING, () => {});
    expect(result.text).toBe('chào bạn');
    expect(engine.events.filter((e) => e.startsWith('load'))).toEqual([
      'load:/qwen.gguf',
    ]);
    // The warm-up runs before the first real answer.
    expect(engine.calls[0].sampling.maxTokens).toBe(1);
    expect(llm.store.getState()).toMatchObject({
      status: 'ready',
      loadedModelId: 'qwen',
    });
  });

  it('never unloads while a generation is running', async () => {
    const engine = new MockEngine({ reply: 'a b c d', tokenDelayMs: 5 });
    const llm = createLlmStore(engine);
    await llm.ensureLoaded(QWEN);
    const answer = llm.generate(ASK, SAMPLING, () => {});
    const unloaded = llm.unload();
    await Promise.all([answer, unloaded]);
    const tail = engine.events.slice(-3);
    expect(tail).toEqual(['generate:start', 'generate:end', 'unload']);
    expect(llm.store.getState()).toMatchObject({
      status: 'idle',
      loadedModelId: null,
    });
  });

  it('switches models between two questions', async () => {
    const engine = new MockEngine({ reply: 'ok' });
    const llm = createLlmStore(engine);
    await llm.ensureLoaded(QWEN);
    await llm.generate(ASK, SAMPLING, () => {});
    await llm.ensureLoaded(GEMMA);
    await llm.generate(ASK, SAMPLING, () => {});
    expect(
      engine.events.filter((e) => e === 'unload' || e.startsWith('load'))
    ).toEqual(['load:/qwen.gguf', 'unload', 'load:/gemma.gguf']);
    expect(engine.modelPath).toBe('/gemma.gguf');
  });

  it('stops during prefill and keeps the partial answer', async () => {
    const engine = new MockEngine({ prefillDelayMs: 30, tokenDelayMs: 5 });
    const llm = createLlmStore(engine);
    await llm.ensureLoaded(QWEN);
    await llm.idle();
    const answer = llm.generate(ASK, SAMPLING, () => {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    await llm.stop();
    const result = await answer;
    expect(result).toMatchObject({ stopped: true, tokens: 0 });
    expect(llm.store.getState().status).toBe('ready');
  });

  it('cancels a request that is still waiting behind a load', async () => {
    const engine = new MockEngine({ loadDelayMs: 20 });
    const llm = createLlmStore(engine);
    const loading = llm.ensureLoaded(QWEN);
    const answer = llm.generate(ASK, SAMPLING, () => {});
    await llm.stop();
    await loading;
    expect(await answer).toMatchObject({ stopped: true, text: '' });
    // Only the warm-up reached the engine.
    expect(engine.calls.every((c) => c.sampling.maxTokens === 1)).toBe(true);
  });

  it('can answer again right after a stop', async () => {
    const engine = new MockEngine({ reply: 'a b c d e f', tokenDelayMs: 5 });
    const llm = createLlmStore(engine);
    await llm.ensureLoaded(QWEN);
    const first = llm.generate(ASK, SAMPLING, (t) => {
      if (t.trim() === 'b') void llm.stop();
    });
    expect((await first).stopped).toBe(true);
    const second = await llm.generate(ASK, SAMPLING, () => {});
    expect(second).toMatchObject({ stopped: false, text: 'a b c d e f' });
  });

  it('reports a failed load', async () => {
    const llm = createLlmStore(new MockEngine({ failLoad: true }));
    await expect(llm.ensureLoaded(QWEN)).rejects.toThrow('Mock load failure');
    expect(llm.store.getState()).toMatchObject({
      status: 'error',
      error: { kind: 'load', modelId: 'qwen' },
    });
    llm.clearError();
    expect(llm.store.getState()).toMatchObject({ status: 'idle', error: null });
  });

  it('releases the model on a memory warning', async () => {
    const engine = new MockEngine({ reply: 'a b c', tokenDelayMs: 5 });
    const llm = createLlmStore(engine);
    await llm.ensureLoaded(QWEN);
    const answer = llm.generate(ASK, SAMPLING, () => {});
    await llm.handleMemoryWarning();
    expect((await answer).stopped).toBe(true);
    expect(engine.isLoaded).toBe(false);
    expect(llm.store.getState()).toMatchObject({
      status: 'error',
      error: { kind: 'memory', modelId: 'qwen' },
    });
  });
});
