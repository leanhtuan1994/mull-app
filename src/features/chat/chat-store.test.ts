import { createRepos, type Repos } from '@/db/repos';
import { createTestDb } from '@/db/test-db';
import { createLlmStore } from '@/features/llm/llm-store';
import { MockEngine } from '@/features/llm/mock-engine';
import {
  findCatalogModel,
  getCatalogModels,
  loadCatalog,
} from '@/features/models/catalog';

import { createChatStore } from './chat-store';
import type { ResponseLength } from './context-budget';

const QWEN = 'qwen3-0.6b-q4km';
const GEMMA = 'gemma-3-1b-it-q4km';

async function setup(engine = new MockEngine({ reply: 'Xin chào bạn' })) {
  const repos: Repos = createRepos(await createTestDb());
  await repos.models.syncCatalog(
    getCatalogModels(),
    loadCatalog().catalogVersion
  );
  await repos.presets.seed([
    {
      key: 'helpful',
      name: 'Trợ lý hữu ích',
      content: 'Bạn là trợ lý hữu ích.',
      isDefault: true,
    },
  ]);
  const settings = {
    temperature: 0.8,
    responseLength: 'medium' as ResponseLength,
    defaultModelId: QWEN as string | null,
  };
  const paths: Record<string, string> = {
    [QWEN]: '/m/qwen.gguf',
    [GEMMA]: '/m/gemma.gguf',
  };
  const llm = createLlmStore(engine);
  const chat = createChatStore({
    repos: () => repos,
    llm,
    findModel: (id) => findCatalogModel(id),
    modelPath: (id) => paths[id],
    settings: () => settings,
  });
  chat.startNew();
  return { repos, llm, chat, engine, settings, paths };
}

describe('chat store', () => {
  it('creates a chat from the first message and saves the answer with metrics', async () => {
    const { chat, repos } = await setup();
    const chatId = await chat.send(
      'Lượng tử hoá (quantization) nghĩa là gì khi chạy model AI?'
    );
    expect(chatId).not.toBeNull();
    const row = await repos.chats.get(chatId!);
    expect(row).toMatchObject({
      modelId: QWEN,
      systemPrompt: 'Bạn là trợ lý hữu ích.',
    });
    expect(Array.from(row!.title)).toHaveLength(40);

    const state = chat.store.getState();
    expect(state.streaming).toBeNull();
    expect(state.messages.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Lượng tử hoá (quantization) nghĩa là gì khi chạy model AI?'],
      ['assistant', 'Xin chào bạn'],
    ]);
    const saved = await repos.messages.listByChat(chatId!);
    expect(saved[1]).toMatchObject({
      modelName: 'Qwen3 0.6B',
      tokenCount: 3,
      stoppedByUser: 0,
    });
    expect(saved[1].timeToFirstToken).not.toBeNull();
  });

  it('sends the chat prompt as system message and uses the settings', async () => {
    const { chat, engine, settings } = await setup();
    settings.temperature = 1.2;
    settings.responseLength = 'short';
    await chat.send('Chào');
    const call = engine.calls.find((c) => c.sampling.maxTokens !== 1)!;
    expect(call.messages[0]).toEqual({
      role: 'system',
      content: 'Bạn là trợ lý hữu ích.',
    });
    expect(call.sampling).toMatchObject({ temperature: 1.2, maxTokens: 256 });
  });

  it('saves a stopped answer with the stopped flag and can send again', async () => {
    const engine = new MockEngine({
      reply: 'một hai ba bốn năm sáu bảy',
      tokenDelayMs: 5,
    });
    const { chat, repos } = await setup(engine);
    // Stop as soon as the first words reach the UI.
    const unsubscribe = chat.store.subscribe((state) => {
      if (state.streaming?.text) {
        unsubscribe();
        void chat.stop();
      }
    });
    const chatId = await chat.send('Kể chuyện');
    const answer = (await repos.messages.listByChat(chatId!))[1];
    expect(answer.stoppedByUser).toBe(1);
    expect(answer.content.length).toBeGreaterThan(0);
    expect(answer.content).not.toBe('một hai ba bốn năm sáu bảy');

    await chat.send('Tiếp');
    expect(chat.store.getState().messages).toHaveLength(4);
  });

  it('keeps the old chat prompt after the preset changes', async () => {
    const { chat, repos } = await setup();
    const chatId = await chat.send('Một');
    const preset = (await repos.presets.getDefault())!;
    await repos.presets.update(preset.id, {
      name: preset.name,
      content: 'Khác hẳn',
    });
    await chat.open(chatId!);
    await chat.send('Hai');
    expect((await repos.chats.get(chatId!))?.systemPrompt).toBe(
      'Bạn là trợ lý hữu ích.'
    );
  });

  it('regenerates the last answer in place', async () => {
    let n = 0;
    const engine = new MockEngine({ reply: () => `Trả lời ${++n}` });
    const { chat, repos } = await setup(engine);
    const chatId = await chat.send('Hỏi');
    await chat.regenerate();
    const rows = await repos.messages.listByChat(chatId!);
    expect(rows).toHaveLength(2);
    // n=1 is the warm-up, 2 the first answer, 3 the regenerated one.
    expect(rows[1].content).toBe('Trả lời 3');
    expect(chat.store.getState().messages[1].content).toBe('Trả lời 3');
  });

  it('switches models for this chat only and frees the old one', async () => {
    const { chat, repos, engine } = await setup();
    const chatId = await chat.send('Một');
    await chat.switchModel(GEMMA);
    expect(engine.isLoaded).toBe(false);
    await chat.send('Hai');
    expect((await repos.chats.get(chatId!))?.modelId).toBe(GEMMA);
    expect(engine.modelPath).toBe('/m/gemma.gguf');
    const rows = await repos.messages.listByChat(chatId!);
    expect(rows.map((r) => r.modelName)).toEqual([
      null,
      'Qwen3 0.6B',
      null,
      'Gemma 3 1B',
    ]);
  });

  it('falls back to the default model when the chat model was deleted', async () => {
    const { chat, repos, paths, settings } = await setup();
    const chatId = await chat.send('Một');
    await chat.switchModel(GEMMA);
    delete paths[GEMMA];
    settings.defaultModelId = QWEN;
    await chat.send('Hai');
    expect((await repos.chats.get(chatId!))?.modelId).toBe(QWEN);
  });

  it('keeps a reply in its own chat when the user switches during the load', async () => {
    const engine = new MockEngine({ reply: 'trả lời A', loadDelayMs: 30 });
    const { chat, repos } = await setup(engine);
    const sending = chat.send('Hỏi trong A');
    await new Promise((resolve) => setTimeout(resolve, 5));
    const other = await repos.chats.create({
      title: 'B',
      modelId: QWEN,
      systemPrompt: '',
    });
    await chat.open(other);
    const chatA = await sending;
    expect(chatA).not.toBe(other);
    expect(await repos.messages.listByChat(other)).toEqual([]);
    expect(chat.store.getState()).toMatchObject({
      messages: [],
      streaming: null,
    });
    expect(
      (await repos.messages.listByChat(chatA!)).map((m) => m.role)
    ).toEqual(['user']);
  });

  it('keeps the old answer when a regenerate is stopped before any text', async () => {
    const engine = new MockEngine({ reply: 'câu cũ', prefillDelayMs: 0 });
    const { chat, repos } = await setup(engine);
    const chatId = await chat.send('Hỏi');
    const slow = new MockEngine({ reply: 'câu mới', prefillDelayMs: 40 });
    Object.assign(engine, {
      options: (slow as unknown as { options: object }).options,
    });
    const regenerating = chat.regenerate();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await chat.stop();
    await regenerating;
    const rows = await repos.messages.listByChat(chatId!);
    expect(rows[1].content).toBe('câu cũ');
    expect(chat.store.getState().streaming).toBeNull();
  });

  it('reports a missing model instead of sending', async () => {
    const { chat, settings, repos } = await setup();
    settings.defaultModelId = null;
    chat.startNew();
    expect(await chat.send('Chào')).toBeNull();
    expect(chat.store.getState().error).toBe('noModel');
    expect(await repos.chats.list()).toEqual([]);
  });

  it('shows a load error and keeps the user message', async () => {
    const { chat, repos } = await setup(new MockEngine({ failLoad: true }));
    const chatId = await chat.send('Chào');
    expect(chat.store.getState().error).toBe('load');
    expect(await repos.messages.listByChat(chatId!)).toHaveLength(1);
  });

  it('flushes streamed tokens once per frame', async () => {
    const frames: (() => void)[] = [];
    const repos: Repos = createRepos(await createTestDb());
    await repos.models.syncCatalog(getCatalogModels(), 1);
    const llm = createLlmStore(new MockEngine({ reply: 'a b c d e f' }));
    const chat = createChatStore({
      repos: () => repos,
      llm,
      findModel: (id) => findCatalogModel(id),
      modelPath: () => '/m.gguf',
      settings: () => ({
        temperature: 0.8,
        responseLength: 'medium',
        defaultModelId: QWEN,
      }),
      scheduleFrame: (cb) => frames.push(cb),
    });
    chat.startNew();
    await chat.send('x');
    // Six tokens in one tick schedule a single frame.
    expect(frames).toHaveLength(1);
  });
});
