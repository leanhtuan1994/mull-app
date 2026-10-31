import { createRepos } from '@/db/repos';
import { createTestDb } from '@/db/test-db';

import {
  createAttachmentFiles,
  DocumentTooLargeError,
} from './attachment-files';

const ROOT = '/app/attachments';

function fakeFiles(initial: Record<string, number> = {}) {
  const files = new Map<string, number>(Object.entries(initial));
  const list = (path: string) => [
    ...new Set(
      [...files.keys()]
        .filter((p) => p.startsWith(`${path}/`))
        .map((p) => p.slice(path.length + 1).split('/')[0])
    ),
  ];
  return {
    files,
    api: {
      attachmentsDirectory: async () => ROOT,
      ensureDirectory: async () => {},
      exists: async (path: string) => files.has(path) || list(path).length > 0,
      fileSize: async (path: string) => files.get(path) ?? -1,
      listDirectory: async (path: string) => list(path),
      move: async (from: string, to: string) => {
        for (const [key, size] of [...files]) {
          if (key === from || key.startsWith(`${from}/`)) {
            files.delete(key);
            files.set(to + key.slice(from.length), size);
          }
        }
      },
      remove: async (path: string) => {
        for (const key of [...files.keys()])
          if (key === path || key.startsWith(`${path}/`)) files.delete(key);
      },
      resizeImage: async (_from: string, to: string, maxSide: number) => {
        files.set(to, maxSide * 10);
        return { width: maxSide, height: Math.round(maxSide * 0.75) };
      },
    },
  };
}

async function setup(initial?: Record<string, number>, now = () => 1_000_000) {
  const repos = createRepos(await createTestDb());
  const fs = fakeFiles(initial);
  let n = 0;
  const service = createAttachmentFiles({
    repos: () => repos,
    files: fs.api,
    newId: () => `id${++n}`,
    now,
  });
  await service.init();
  return { repos, fs, service };
}

describe('attachment files', () => {
  it('stores a picked photo as a draft with a thumbnail', async () => {
    const ctx = await setup({ '/tmp/pick.heic': 900 });
    const row = await ctx.service.addImage(
      'file:///tmp/pick.heic',
      'IMG_1.HEIC'
    );
    expect(row).toMatchObject({
      kind: 'image',
      chatId: null,
      messageId: null,
      path: 'drafts/id1/image.jpg',
      thumbPath: 'drafts/id1/thumb.jpg',
      width: 1536,
    });
    expect(ctx.fs.files.has('/tmp/pick.heic')).toBe(false);
    expect(ctx.fs.files.has(`${ROOT}/drafts/id1/thumb.jpg`)).toBe(true);
  });

  it('moves sent drafts under their chat', async () => {
    const ctx = await setup({ '/tmp/a.pdf': 100 });
    const doc = await ctx.service.addDocument(
      'file:///tmp/a.pdf',
      'Báo cáo quý 3.pdf',
      'application/pdf'
    );
    expect(doc.path).toBe('drafts/id1/Báo-cáo-quý-3.pdf');
    const chatId = await ctx.repos.chats.create({
      title: 'x',
      modelId: null,
      systemPrompt: '',
    });
    const messageId = await ctx.repos.messages.add({
      chatId,
      role: 'user',
      content: 'Tóm tắt',
    });
    await ctx.service.attachDrafts([doc.id], { chatId, messageId });
    const [sent] = await ctx.repos.attachments.listByChat(chatId);
    expect(sent.path).toBe(`${chatId}/id1/Báo-cáo-quý-3.pdf`);
    expect(ctx.fs.files.has(`${ROOT}/${chatId}/id1/Báo-cáo-quý-3.pdf`)).toBe(
      true
    );
    await ctx.service.removeChatFiles(chatId);
    expect([...ctx.fs.files.keys()]).toEqual([]);
  });

  it('refuses documents over 20 MB and deletes the picked copy', async () => {
    const ctx = await setup({ '/tmp/big.pdf': 21 * 1024 * 1024 });
    await expect(
      ctx.service.addDocument(
        'file:///tmp/big.pdf',
        'big.pdf',
        'application/pdf'
      )
    ).rejects.toBeInstanceOf(DocumentTooLargeError);
    expect(ctx.fs.files.size).toBe(0);
  });

  it('cleans stale drafts and orphan folders on launch', async () => {
    const repos = createRepos(await createTestDb());
    const old = await repos.attachments.addDraft({
      kind: 'image',
      name: 'cu.jpg',
      mime: 'image/jpeg',
      path: 'drafts/old/image.jpg',
      sizeBytes: 1,
      now: 0,
    });
    const fs = fakeFiles({
      [`${ROOT}/drafts/old/image.jpg`]: 1,
      [`${ROOT}/7/lost/file.pdf`]: 1,
    });
    const service = createAttachmentFiles({
      repos: () => repos,
      files: fs.api,
      newId: () => 'x',
      now: () => 48 * 60 * 60 * 1000,
    });
    await service.init();
    expect(await repos.attachments.get(old)).toBeNull();
    expect([...fs.files.keys()]).toEqual([]);
  });

  it('finishes a move that a crash interrupted', async () => {
    const repos = createRepos(await createTestDb());
    const chatId = await repos.chats.create({
      title: 'x',
      modelId: null,
      systemPrompt: '',
    });
    const messageId = await repos.messages.add({
      chatId,
      role: 'user',
      content: 'x',
    });
    const id = await repos.attachments.addDraft({
      kind: 'image',
      name: 'a.jpg',
      mime: 'image/jpeg',
      path: 'drafts/u1/image.jpg',
      sizeBytes: 1,
    });
    // The row was updated, then Mull died before the folder moved.
    await repos.attachments.attach(
      [{ id, path: `${chatId}/u1/image.jpg`, thumbPath: null }],
      { chatId, messageId }
    );
    const fs = fakeFiles({ [`${ROOT}/drafts/u1/image.jpg`]: 1 });
    const service = createAttachmentFiles({
      repos: () => repos,
      files: fs.api,
      newId: () => 'x',
    });
    await service.init();
    expect([...fs.files.keys()]).toEqual([`${ROOT}/${chatId}/u1/image.jpg`]);
  });
});
