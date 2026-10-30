import type { SamplingParams } from './engine';
import { MockEngine, mockTokenize } from './mock-engine';
import { createSerialQueue } from './serial-queue';
import { stripThinking } from './strip-thinking';

const SAMPLING: SamplingParams = {
  temperature: 0.8,
  topP: 0.9,
  minP: 0,
  repeatPenalty: 1,
  maxTokens: 512,
};
const ASK = [{ role: 'user' as const, content: 'Xin chào' }];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('MockEngine', () => {
  it('streams the reply token by token', async () => {
    const engine = new MockEngine({ reply: 'một hai ba' });
    await engine.load('/m.gguf', { contextTokens: 2048 });
    const tokens: string[] = [];
    const result = await engine.generate(ASK, SAMPLING, (t) => tokens.push(t));
    expect(tokens).toEqual(['một', ' hai', ' ba']);
    expect(result).toMatchObject({
      text: 'một hai ba',
      tokens: 3,
      stopped: false,
    });
    expect(result.ttftMs).not.toBeNull();
  });

  it('respects maxTokens', async () => {
    const engine = new MockEngine({ reply: 'a b c d e' });
    await engine.load('/m.gguf', { contextTokens: 2048 });
    const result = await engine.generate(
      ASK,
      { ...SAMPLING, maxTokens: 2 },
      () => {}
    );
    expect(result.text).toBe('a b');
  });

  it('stops mid-stream and reports it', async () => {
    const engine = new MockEngine({
      reply: 'a b c d e f g h',
      tokenDelayMs: 5,
    });
    await engine.load('/m.gguf', { contextTokens: 2048 });
    const tokens: string[] = [];
    const running = engine.generate(ASK, SAMPLING, (t) => {
      tokens.push(t);
      if (tokens.length === 2) void engine.stop();
    });
    const result = await running;
    expect(result.stopped).toBe(true);
    expect(result.tokens).toBe(2);
  });

  it('stops during prefill with no tokens', async () => {
    const engine = new MockEngine({ prefillDelayMs: 30 });
    await engine.load('/m.gguf', { contextTokens: 2048 });
    const running = engine.generate(ASK, SAMPLING, () => {});
    await engine.stop();
    const result = await running;
    expect(result).toMatchObject({
      text: '',
      tokens: 0,
      stopped: true,
      ttftMs: null,
    });
  });

  it('waits for generation to finish before unloading', async () => {
    const engine = new MockEngine({ reply: 'a b c', tokenDelayMs: 10 });
    await engine.load('/m.gguf', { contextTokens: 2048 });
    const running = engine.generate(ASK, SAMPLING, () => {});
    await engine.unload();
    await running;
    expect(engine.events).toEqual([
      'load:/m.gguf',
      'generate:start',
      'generate:end',
      'unload',
    ]);
    expect(engine.isLoaded).toBe(false);
  });

  it('loads a second model after releasing the first', async () => {
    const engine = new MockEngine();
    await engine.load('/a.gguf', { contextTokens: 2048 });
    await engine.unload();
    await engine.load('/b.gguf', { contextTokens: 2048 });
    expect(engine.modelPath).toBe('/b.gguf');
  });

  it('refuses to generate without a model', async () => {
    await expect(
      new MockEngine().generate(ASK, SAMPLING, () => {})
    ).rejects.toThrow('No model is loaded');
  });

  it('tokenizes into word pieces', () => {
    expect(mockTokenize('  a  b\nc')).toEqual(['  a', '  b', '\nc']);
  });
});

describe('createSerialQueue', () => {
  it('runs tasks one at a time in order', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`${name}:start`);
      await sleep(ms);
      log.push(`${name}:end`);
      return name;
    };
    const results = await Promise.all([
      queue.run(task('load', 10)),
      queue.run(task('generate', 5)),
      queue.run(task('unload', 1)),
    ]);
    expect(results).toEqual(['load', 'generate', 'unload']);
    expect(log).toEqual([
      'load:start',
      'load:end',
      'generate:start',
      'generate:end',
      'unload:start',
      'unload:end',
    ]);
  });

  it('keeps going after a task fails', async () => {
    const queue = createSerialQueue();
    const failed = queue.run(async () => {
      throw new Error('boom');
    });
    const next = queue.run(async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
    await queue.idle();
    expect(queue.pending).toBe(0);
  });
});

describe('stripThinking', () => {
  it('removes a finished thinking block', () => {
    expect(stripThinking('<think>\nhmm\n</think>\n\nXin chào')).toBe(
      'Xin chào'
    );
  });
  it('hides an unfinished block while streaming', () => {
    expect(stripThinking('<think>đang nghĩ')).toBe('');
  });
  it('holds back a partial tag', () => {
    expect(stripThinking('Câu trả lời <thi')).toBe('Câu trả lời ');
  });
  it('leaves normal text alone', () => {
    expect(stripThinking('a < b')).toBe('a < b');
  });
});
