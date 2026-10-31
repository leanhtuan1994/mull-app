import type { SamplingParams } from './engine';
import { createLlmStore } from './llm-store';
import { MockEmbeddingEngine, MockEngine } from './mock-engine';

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

  describe('embedding', () => {
    const EMB = { id: 'emb', path: '/emb.gguf', contextTokens: 512 };

    it('loads the embedding model on first use and returns vectors', async () => {
      const embedder = new MockEmbeddingEngine();
      const llm = createLlmStore(new MockEngine(), { embedder });
      const vectors = await llm.embed(EMB, ['một', 'hai']);
      expect(vectors).toHaveLength(2);
      await llm.embed(EMB, ['ba']);
      expect(embedder.events.filter((e) => e.startsWith('load'))).toEqual([
        'load:/emb.gguf',
      ]);
    });

    it('lets a question jump ahead of queued embedding batches', async () => {
      const engine = new MockEngine({ reply: 'ok' });
      const embedder = new MockEmbeddingEngine({ delayMs: 5 });
      const llm = createLlmStore(engine, { embedder });
      await llm.ensureLoaded(QWEN);
      const order: string[] = [];
      const batches = [1, 2, 3].map((n) =>
        llm.embed(EMB, ['đoạn']).then(() => order.push(`embed${n}`))
      );
      const answer = llm
        .generate(ASK, SAMPLING, () => {})
        .then(() => order.push('answer'));
      await Promise.all([...batches, answer]);
      // At most the batch already running finishes before the answer.
      expect(order.indexOf('answer')).toBeLessThanOrEqual(1);
    });

    it('releases the chat model first when both do not fit', async () => {
      const engine = new MockEngine();
      const embedder = new MockEmbeddingEngine();
      const llm = createLlmStore(engine, {
        embedder,
        fitsTogether: () => false,
      });
      await llm.ensureLoaded(QWEN);
      await llm.embed(EMB, ['đoạn']);
      expect(engine.isLoaded).toBe(false);
      await llm.ensureLoaded(QWEN);
      expect(embedder.isLoaded).toBe(false);
    });

    it('reloads the chat model when an embed released it before answering', async () => {
      const engine = new MockEngine({ reply: 'ok' });
      const embedder = new MockEmbeddingEngine();
      const llm = createLlmStore(engine, {
        embedder,
        fitsTogether: () => false,
      });
      await llm.ensureLoaded(QWEN);
      // The question's vector is computed between loading and answering.
      await llm.embed(EMB, ['câu hỏi'], { priority: 'normal' });
      expect(engine.isLoaded).toBe(false);
      const result = await llm.generate(ASK, SAMPLING, () => {});
      expect(result.text).toBe('ok');
      expect(llm.store.getState().loadedModelId).toBe('qwen');
    });

    it('skips a queued embed that should no longer run', async () => {
      const llm = createLlmStore(new MockEngine(), {
        embedder: new MockEmbeddingEngine(),
      });
      await expect(
        llm.embed(EMB, ['x'], { shouldRun: () => false })
      ).rejects.toThrow('Embedding skipped');
    });

    it('drops the embedding model first on a memory warning', async () => {
      const engine = new MockEngine();
      const embedder = new MockEmbeddingEngine();
      const llm = createLlmStore(engine, { embedder });
      await llm.ensureLoaded(QWEN);
      await llm.embed(EMB, ['đoạn']);
      await llm.handleMemoryWarning();
      expect(embedder.isLoaded).toBe(false);
      expect(engine.isLoaded).toBe(true);
      expect(llm.store.getState().error).toBeNull();
      await llm.handleMemoryWarning();
      expect(engine.isLoaded).toBe(false);
      expect(llm.store.getState().error?.kind).toBe('memory');
    });
  });

  it('counts tokens only on a loaded model, after pending work', async () => {
    const engine = new MockEngine();
    const llm = createLlmStore(engine);
    expect(await llm.countTokens('một hai')).toBeNull();
    await llm.ensureLoaded(QWEN);
    const unloaded = llm.unload();
    // Queued behind the unload, so it never tokenizes a released model.
    expect(await llm.countTokens('một hai')).toBeNull();
    await unloaded;
    await llm.ensureLoaded(QWEN);
    expect(await llm.countTokens('một hai', ['/a.jpg'])).toBe(66);
  });
});
