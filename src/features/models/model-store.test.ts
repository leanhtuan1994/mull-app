import { createRepos } from '@/db/repos';
import { createTestDb } from '@/db/test-db';

import type { CatalogModel } from './catalog-schema';
import {
  downloadFraction,
  downloadsToStart,
  reduceDownload,
} from './download-machine';
import type {
  DownloadTransport,
  LiveTransfer,
  TransferHandlers,
} from './downloader';
import { createModelStore, type ModelFiles } from './model-store';

const MODELS_DIR = '/app/models';

function model(id: string, sizeBytes: number, sha256: string): CatalogModel {
  return {
    id,
    name: id,
    family: 'qwen',
    publisher: 'Test',
    license: 'MIT',
    params: 0.5,
    quant: 'Q4_K_M',
    sizeBytes,
    sha256,
    url: `https://huggingface.co/x/resolve/abc/${id}.gguf`,
    sourceUrl: 'https://huggingface.co/x',
    contextTokens: 2048,
    thinking: false,
    defaultSampling: { temperature: 0.8, topP: 0.9, minP: 0, repeatPenalty: 1 },
    labels: [],
    description: { vi: 'test', en: 'test' },
    simulatorFriendly: true,
  };
}

const CATALOG = [
  model('a', 10, 'a'.repeat(64)),
  model('b', 20, 'b'.repeat(64)),
  model('c', 30, 'c'.repeat(64)),
];

/** Files as path → { size, hash }; directories are implied by prefixes. */
function fakeFiles() {
  const files = new Map<string, { size: number; hash: string }>();
  const dirs = new Set<string>();
  const api: ModelFiles = {
    modelsDirectory: async () => MODELS_DIR,
    ensureDirectory: async (path) => {
      dirs.add(path);
    },
    sha256: async (path) => files.get(path)?.hash ?? '',
    fileSize: async (path) => files.get(path)?.size ?? -1,
    exists: async (path) => files.has(path) || dirs.has(path),
    listDirectory: async (path) => [
      ...new Set(
        [...files.keys(), ...dirs]
          .filter((p) => p.startsWith(`${path}/`))
          .map((p) => p.slice(path.length + 1).split('/')[0])
      ),
    ],
    move: async (from, to) => {
      files.set(to, files.get(from)!);
      files.delete(from);
    },
    remove: async (path) => {
      for (const key of [...files.keys()])
        if (key === path || key.startsWith(`${path}/`)) files.delete(key);
      for (const key of [...dirs])
        if (key === path || key.startsWith(`${path}/`)) dirs.delete(key);
    },
  };
  return { api, files, dirs };
}

function fakeTransport(live: LiveTransfer[] = []) {
  const handlers = new Map<string, TransferHandlers>();
  const started: string[] = [];
  const stopped: string[] = [];
  const completed: string[] = [];
  const transport: DownloadTransport = {
    start: ({ id }, h) => {
      started.push(id);
      handlers.set(id, h);
    },
    stop: async (id) => {
      stopped.push(id);
      handlers.delete(id);
    },
    reattach: async (handlersFor) => {
      for (const t of live) handlers.set(t.id, handlersFor(t.id));
      return live;
    },
    complete: (id) => completed.push(id),
  };
  return { transport, handlers, started, stopped, completed };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function setup(
  live: LiveTransfer[] = [],
  seed?: (f: ReturnType<typeof fakeFiles>) => void
) {
  const repos = createRepos(await createTestDb());
  await repos.models.syncCatalog(CATALOG, 1);
  const fs = fakeFiles();
  seed?.(fs);
  const net = fakeTransport(live);
  const models = createModelStore({
    repo: repos.models,
    files: fs.api,
    transport: net.transport,
    catalog: () => CATALOG,
  });
  return { repos, fs, net, models };
}

/** Simulates the transfer finishing with the given bytes at the partial path. */
function finish(
  ctx: Awaited<ReturnType<typeof setup>>,
  id: string,
  file: { size: number; hash: string }
) {
  ctx.fs.files.set(`${MODELS_DIR}/${id}/model.gguf.download`, file);
  ctx.net.handlers.get(id)!.onDone();
}

describe('download state machine', () => {
  it('walks queued → downloading → verifying → done', () => {
    let s = reduceDownload(undefined, { type: 'enqueue', bytesTotal: 100 });
    s = reduceDownload(s, { type: 'start' });
    s = reduceDownload(s, { type: 'progress', bytesDone: 40 });
    expect(downloadFraction(s)).toBeCloseTo(0.4);
    s = reduceDownload(s, { type: 'downloaded' });
    expect(s?.status).toBe('verifying');
    s = reduceDownload(s, { type: 'verified' });
    expect(s).toMatchObject({ status: 'done', bytesDone: 100 });
  });

  it('ignores events that do not fit the current state', () => {
    const queued = reduceDownload(undefined, {
      type: 'enqueue',
      bytesTotal: 1,
    });
    expect(reduceDownload(queued, { type: 'verified' })).toBe(queued);
    expect(reduceDownload(undefined, { type: 'start' })).toBeUndefined();
  });

  it('starts at most two transfers', () => {
    const q = { status: 'queued' as const, bytesDone: 0, bytesTotal: 1 };
    const d = { ...q, status: 'downloading' as const };
    expect(downloadsToStart({ a: q, b: q, c: q }, ['a', 'b', 'c'])).toEqual([
      'a',
      'b',
    ]);
    expect(downloadsToStart({ a: d, b: q, c: q }, ['a', 'b', 'c'])).toEqual([
      'b',
    ]);
  });
});

describe('model store', () => {
  it('downloads, verifies and marks a model downloaded', async () => {
    const ctx = await setup();
    await ctx.models.init();
    ctx.models.download('a');
    await flush();
    expect(ctx.net.started).toEqual(['a']);
    ctx.net.handlers.get('a')!.onProgress(5, 10);
    expect(
      downloadFraction(ctx.models.store.getState().downloads.a)
    ).toBeCloseTo(0.5);

    finish(ctx, 'a', { size: 10, hash: 'a'.repeat(64) });
    await flush();
    await flush();
    const state = ctx.models.store.getState();
    expect(state.downloads.a?.status).toBe('done');
    expect(state.downloadedIds).toEqual(['a']);
    expect(state.paths.a).toBe(`${MODELS_DIR}/a/model.gguf`);
    expect(ctx.fs.files.has(`${MODELS_DIR}/a/model.gguf`)).toBe(true);
    expect(ctx.net.completed).toEqual(['a']);
    expect(await ctx.repos.models.get('a')).toMatchObject({ isDownloaded: 1 });
  });

  it('rejects a file with the wrong checksum and deletes it', async () => {
    const ctx = await setup();
    await ctx.models.init();
    ctx.models.download('a');
    await flush();
    finish(ctx, 'a', { size: 10, hash: 'f'.repeat(64) });
    await flush();
    await flush();
    expect(ctx.models.store.getState().downloads.a).toMatchObject({
      status: 'failed',
      error: 'checksum',
    });
    expect(ctx.models.store.getState().downloadedIds).toEqual([]);
    expect([...ctx.fs.files.keys()]).toEqual([]);
  });

  it('rejects a truncated file', async () => {
    const ctx = await setup();
    await ctx.models.init();
    ctx.models.download('a');
    await flush();
    finish(ctx, 'a', { size: 9, hash: 'a'.repeat(64) });
    await flush();
    expect(ctx.models.store.getState().downloads.a).toMatchObject({
      status: 'failed',
      error: 'size',
    });
  });

  it('queues a third download until a slot frees up', async () => {
    const ctx = await setup();
    await ctx.models.init();
    ctx.models.download('a');
    ctx.models.download('b');
    ctx.models.download('c');
    await flush();
    expect(ctx.net.started).toEqual(['a', 'b']);
    expect(ctx.models.store.getState().downloads.c?.status).toBe('queued');
    await ctx.models.cancel('a');
    await flush();
    expect(ctx.net.stopped).toEqual(['a']);
    expect(ctx.net.started).toEqual(['a', 'b', 'c']);
    expect(ctx.models.store.getState().downloads.a).toBeUndefined();
  });

  it('marks a network failure and lets the user retry', async () => {
    const ctx = await setup();
    await ctx.models.init();
    ctx.models.download('a');
    await flush();
    ctx.net.handlers.get('a')!.onError('offline');
    expect(ctx.models.store.getState().downloads.a).toMatchObject({
      status: 'failed',
      error: 'network',
    });
    ctx.models.download('a');
    await flush();
    expect(ctx.net.started).toEqual(['a', 'a']);
  });

  it('reattaches to a transfer that kept running while closed', async () => {
    const ctx = await setup([{ id: 'b', bytesDone: 5, bytesTotal: 20 }]);
    await ctx.models.init();
    expect(ctx.models.store.getState().downloads.b).toMatchObject({
      status: 'downloading',
      bytesDone: 5,
    });
    finish(ctx, 'b', { size: 20, hash: 'b'.repeat(64) });
    await flush();
    await flush();
    expect(ctx.models.store.getState().downloadedIds).toEqual(['b']);
  });

  it('verifies a file that finished while Mull was closed', async () => {
    const ctx = await setup([], (fs) => {
      fs.files.set(`${MODELS_DIR}/c/model.gguf.download`, {
        size: 30,
        hash: 'c'.repeat(64),
      });
    });
    await ctx.models.init();
    await flush();
    await flush();
    expect(ctx.models.store.getState().downloadedIds).toEqual(['c']);
  });

  it('reconciles the database with the disk on launch', async () => {
    const ctx = await setup([], (fs) => {
      fs.files.set(`${MODELS_DIR}/a/model.gguf`, {
        size: 10,
        hash: 'a'.repeat(64),
      });
      fs.files.set(`${MODELS_DIR}/unknown/model.gguf`, { size: 1, hash: '' });
      fs.dirs.add(`${MODELS_DIR}/b`);
    });
    await ctx.repos.models.markDownloaded('a', `${MODELS_DIR}/a/model.gguf`);
    await ctx.repos.models.markDownloaded('c', `${MODELS_DIR}/c/model.gguf`);
    await ctx.models.init();
    expect(ctx.models.store.getState().downloadedIds).toEqual(['a']);
    expect(await ctx.repos.models.get('c')).toMatchObject({ isDownloaded: 0 });
    expect(await ctx.fs.api.listDirectory(MODELS_DIR)).toEqual(['a']);
  });

  it('removes a model without touching other models', async () => {
    const ctx = await setup([], (fs) => {
      fs.files.set(`${MODELS_DIR}/a/model.gguf`, { size: 10, hash: '' });
      fs.files.set(`${MODELS_DIR}/b/model.gguf`, { size: 20, hash: '' });
    });
    await ctx.repos.models.markDownloaded('a', `${MODELS_DIR}/a/model.gguf`);
    await ctx.repos.models.markDownloaded('b', `${MODELS_DIR}/b/model.gguf`);
    await ctx.models.init();
    await ctx.models.remove('a');
    expect(ctx.models.store.getState().downloadedIds).toEqual(['b']);
    expect(ctx.fs.files.has(`${MODELS_DIR}/a/model.gguf`)).toBe(false);
  });
});
