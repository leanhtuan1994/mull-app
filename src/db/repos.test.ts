import { getCatalogModels, loadCatalog } from '@/features/models/catalog';

import { createRepos, type Repos, titleFromMessage } from './repos';
import { BuiltInPresetError } from './repos/preset-repo';
import { createTestDb } from './test-db';

const BUILT_INS = [
  {
    key: 'helpful',
    name: 'Trợ lý hữu ích',
    content: 'Hãy hữu ích.',
    isDefault: true,
  },
  { key: 'concise', name: 'Ngắn gọn', content: 'Trả lời ngắn.' },
];

let repos: Repos;

beforeEach(async () => {
  repos = createRepos(await createTestDb());
  await repos.models.syncCatalog(
    getCatalogModels(),
    loadCatalog().catalogVersion
  );
});

describe('migrations', () => {
  it('is idempotent and records the schema version', async () => {
    const db = await createTestDb();
    const row = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version'
    );
    expect(row?.user_version).toBe(1);
  });
});

describe('titleFromMessage', () => {
  it('cuts long first lines at 40 characters', () => {
    const title = titleFromMessage(
      'Lượng tử hoá (quantization) nghĩa là gì khi chạy model AI trên điện thoại?'
    );
    expect(Array.from(title)).toHaveLength(40);
    expect(title.endsWith('…')).toBe(true);
  });
  it('keeps short ones and uses only the first line', () => {
    expect(titleFromMessage('  Xin chào\nthêm dòng')).toBe('Xin chào');
  });
});

describe('model repo', () => {
  it('keeps download state across catalog syncs', async () => {
    await repos.models.markDownloaded(
      'qwen3-0.6b-q4km',
      '/models/qwen.gguf',
      5
    );
    await repos.models.syncCatalog(getCatalogModels(), 2);
    const row = await repos.models.get('qwen3-0.6b-q4km');
    expect(row).toMatchObject({
      isDownloaded: 1,
      localPath: '/models/qwen.gguf',
      catalogVersion: 2,
    });
    expect((await repos.models.listDownloaded()).map((m) => m.id)).toEqual([
      'qwen3-0.6b-q4km',
    ]);
  });

  it('keeps chats when a model is removed from the device', async () => {
    await repos.models.markDownloaded('qwen3-0.6b-q4km', '/x');
    const chatId = await repos.chats.create({
      title: 'A',
      modelId: 'qwen3-0.6b-q4km',
      systemPrompt: '',
    });
    await repos.models.markNotDownloaded('qwen3-0.6b-q4km');
    expect(await repos.chats.get(chatId)).toMatchObject({
      modelId: 'qwen3-0.6b-q4km',
    });
  });
});

describe('chat and message repos', () => {
  it('finds a chat by an unaccented query', async () => {
    const hit = await repos.chats.create({
      title: 'Lượng tử hoá trên iPhone',
      modelId: null,
      systemPrompt: '',
    });
    await repos.chats.create({
      title: 'Tỉ lệ nấu nước dùng phở',
      modelId: null,
      systemPrompt: '',
    });
    expect((await repos.chats.search('luong tu')).map((c) => c.id)).toEqual([
      hit,
    ]);
    expect((await repos.chats.search('LUONG TỬ')).map((c) => c.id)).toEqual([
      hit,
    ]);
    expect(await repos.chats.search('   ')).toEqual([]);
  });

  it('finds a chat by message text, including đ', async () => {
    const chatId = await repos.chats.create({
      title: 'Du lịch',
      modelId: null,
      systemPrompt: '',
    });
    await repos.messages.add({
      chatId,
      role: 'user',
      content: 'Gợi ý quán ăn ở Đà Nẵng',
    });
    expect(await repos.chats.search('da nang')).toEqual([
      expect.objectContaining({
        id: chatId,
        matchText: 'Gợi ý quán ăn ở Đà Nẵng',
      }),
    ]);
    expect(await repos.chats.search('du lich')).toEqual([
      expect.objectContaining({ id: chatId, matchText: null }),
    ]);
  });

  it('reindexes a renamed chat and completed answers', async () => {
    const chatId = await repos.chats.create({
      title: 'Cũ',
      modelId: null,
      systemPrompt: '',
    });
    await repos.chats.rename(chatId, 'Kế hoạch tuần');
    expect(await repos.chats.search('cu')).toEqual([]);
    expect((await repos.chats.search('ke hoach')).map((c) => c.id)).toEqual([
      chatId,
    ]);

    const id = await repos.messages.add({
      chatId,
      role: 'assistant',
      content: '',
    });
    await repos.messages.complete(id, {
      content: 'Đây là câu trả lời đã dừng',
      tokensPerSecond: 18,
      timeToFirstToken: 420,
      tokenCount: 96,
      stoppedByUser: true,
    });
    expect(await repos.messages.get(id)).toMatchObject({
      content: 'Đây là câu trả lời đã dừng',
      stoppedByUser: 1,
      tokenCount: 96,
      timeToFirstToken: 420,
    });
    expect(
      (await repos.chats.search('tra loi da dung')).map((c) => c.id)
    ).toEqual([chatId]);
  });

  it('cascades message and index deletes with the chat', async () => {
    const chatId = await repos.chats.create({
      title: 'Xoá tôi',
      modelId: null,
      systemPrompt: '',
    });
    await repos.messages.add({
      chatId,
      role: 'user',
      content: 'nội dung riêng',
    });
    await repos.chats.remove(chatId);
    expect(await repos.messages.listByChat(chatId)).toEqual([]);
    expect(await repos.chats.search('noi dung')).toEqual([]);
  });

  it('deletes every chat but leaves models alone', async () => {
    await repos.models.markDownloaded('qwen3-0.6b-q4km', '/x');
    const a = await repos.chats.create({
      title: 'A',
      modelId: null,
      systemPrompt: '',
    });
    await repos.messages.add({ chatId: a, role: 'user', content: 'hello' });
    await repos.chats.removeAll();
    expect(await repos.chats.list()).toEqual([]);
    expect(await repos.chats.search('hello')).toEqual([]);
    expect(await repos.models.listDownloaded()).toHaveLength(1);
  });

  it('lists chats by most recent use', async () => {
    const old = await repos.chats.create({
      title: 'old',
      modelId: null,
      systemPrompt: '',
      now: 1,
    });
    const recent = await repos.chats.create({
      title: 'recent',
      modelId: null,
      systemPrompt: '',
      now: 2,
    });
    await repos.chats.touch(old, 3);
    expect((await repos.chats.list()).map((c) => c.id)).toEqual([old, recent]);
  });
});

describe('preset repo', () => {
  beforeEach(() => repos.presets.seed(BUILT_INS));

  it('seeds built-ins once with one default', async () => {
    await repos.presets.seed(BUILT_INS);
    const presets = await repos.presets.list();
    expect(presets.map((p) => p.name)).toEqual(['Trợ lý hữu ích', 'Ngắn gọn']);
    expect((await repos.presets.getDefault())?.builtInKey).toBe('helpful');
  });

  it('refuses to delete built-ins but resets them', async () => {
    const [helpful] = await repos.presets.list();
    await expect(repos.presets.remove(helpful.id)).rejects.toBeInstanceOf(
      BuiltInPresetError
    );
    await repos.presets.update(helpful.id, { name: 'Đã sửa', content: 'khác' });
    await repos.presets.resetBuiltIn(helpful.id, BUILT_INS);
    expect(await repos.presets.get(helpful.id)).toMatchObject({
      name: 'Trợ lý hữu ích',
      content: 'Hãy hữu ích.',
    });
  });

  it('moves the default back to a built-in when the default is deleted', async () => {
    const id = await repos.presets.create({ name: 'Của tôi', content: 'x' });
    await repos.presets.setDefault(id);
    expect((await repos.presets.getDefault())?.id).toBe(id);
    await repos.presets.remove(id);
    expect((await repos.presets.getDefault())?.builtInKey).toBe('helpful');
  });

  it('does not change existing chats when a preset is edited', async () => {
    const preset = (await repos.presets.getDefault())!;
    const chatId = await repos.chats.create({
      title: 'A',
      modelId: null,
      systemPrompt: preset.content,
    });
    await repos.presets.update(preset.id, {
      name: preset.name,
      content: 'Nội dung mới',
    });
    expect((await repos.chats.get(chatId))?.systemPrompt).toBe('Hãy hữu ích.');
  });

  describe('attachments and document chunks', () => {
    const draft = {
      kind: 'document' as const,
      name: 'ghi-chu.pdf',
      mime: 'application/pdf',
      path: 'drafts/x/ghi-chu.pdf',
      sizeBytes: 1200,
    };

    it('turns a draft into a sent attachment', async () => {
      const chatId = await repos.chats.create({
        title: 'Tài liệu',
        modelId: null,
        systemPrompt: '',
      });
      const messageId = await repos.messages.add({
        chatId,
        role: 'user',
        content: 'Tóm tắt giúp mình',
      });
      const id = await repos.attachments.addDraft(draft);
      expect(await repos.attachments.listByChat(chatId)).toEqual([]);
      await repos.attachments.attach(
        [{ id, path: `${chatId}/x/ghi-chu.pdf`, thumbPath: null }],
        { chatId, messageId }
      );
      expect(await repos.attachments.listByChat(chatId)).toEqual([
        expect.objectContaining({
          id,
          messageId,
          path: `${chatId}/x/ghi-chu.pdf`,
        }),
      ]);
    });

    it('stores vectors without changing chunk ids', async () => {
      const chatId = await repos.chats.create({
        title: 'Tài liệu',
        modelId: null,
        systemPrompt: '',
      });
      const messageId = await repos.messages.add({
        chatId,
        role: 'user',
        content: 'Hỏi',
      });
      const id = await repos.attachments.addDraft(draft);
      await repos.attachments.attach([{ id, path: 'p', thumbPath: null }], {
        chatId,
        messageId,
      });
      await repos.chunks.replace(id, [
        { ord: 0, page: 1, text: 'Đoạn một', tokenCount: 3 },
        { ord: 1, page: 2, text: 'Đoạn hai', tokenCount: 3 },
      ]);
      const [first, second] = await repos.chunks.listByAttachment(id);
      await repos.chunks.setEmbeddings(
        [{ id: first.id, embedding: [0.5, -0.25, 1] }],
        'emb'
      );
      expect(
        (await repos.chunks.listUnembedded(id, 'emb')).map((c) => c.id)
      ).toEqual([second.id]);
      const indexed = await repos.chunks.listForChat(chatId);
      expect(indexed.map((c) => c.id)).toEqual([first.id, second.id]);
      expect(Array.from(indexed[0].embedding!)).toEqual([0.5, -0.25, 1]);
      expect(indexed[1].embedding).toBeNull();
      expect(await repos.chunks.getSource(second.id)).toMatchObject({
        text: 'Đoạn hai',
        page: 2,
        name: 'ghi-chu.pdf',
        chatId,
      });
    });

    it('deletes attachments and passages with their chat', async () => {
      const chatId = await repos.chats.create({
        title: 'Xoá',
        modelId: null,
        systemPrompt: '',
      });
      const messageId = await repos.messages.add({
        chatId,
        role: 'user',
        content: 'x',
      });
      const id = await repos.attachments.addDraft(draft);
      await repos.attachments.attach([{ id, path: 'p', thumbPath: null }], {
        chatId,
        messageId,
      });
      await repos.chunks.replace(id, [
        { ord: 0, page: null, text: 'a', tokenCount: 1 },
      ]);
      const [chunk] = await repos.chunks.listByAttachment(id);
      await repos.chats.remove(chatId);
      expect(await repos.attachments.get(id)).toBeNull();
      expect(await repos.chunks.getSource(chunk.id)).toBeNull();
    });

    it('records the sources of an answer', async () => {
      const chatId = await repos.chats.create({
        title: 'Nguồn',
        modelId: null,
        systemPrompt: '',
      });
      const id = await repos.messages.add({
        chatId,
        role: 'assistant',
        content: 'Theo [1]',
      });
      const sources = [
        { n: 1, chunkId: 7, attachmentId: 3, name: 'a.pdf', page: 2 },
      ];
      await repos.messages.setSources(id, sources);
      expect(JSON.parse((await repos.messages.get(id))!.sources!)).toEqual(
        sources
      );
    });
  });
});
