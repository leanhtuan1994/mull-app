import { createStore } from 'zustand/vanilla';

import type { ModelRepo } from '@/db/repos';

import type { MullFilesNative } from '../../../modules/mull-files';
import type { CatalogModel } from './catalog-schema';
import {
  type DownloadErrorKind,
  type DownloadEvent,
  type DownloadState,
  downloadsToStart,
  reduceDownload,
} from './download-machine';
import type { DownloadTransport, TransferHandlers } from './downloader';

export const MODEL_FILE = 'model.gguf';
export const PARTIAL_FILE = 'model.gguf.download';

export type ModelFiles = Pick<
  MullFilesNative,
  | 'modelsDirectory'
  | 'ensureDirectory'
  | 'sha256'
  | 'fileSize'
  | 'exists'
  | 'listDirectory'
  | 'move'
  | 'remove'
>;

export type ModelStoreState = {
  ready: boolean;
  /** Ids of models whose verified file is on disk. */
  downloadedIds: string[];
  /** Absolute paths of verified model files. */
  paths: Record<string, string>;
  downloads: Record<string, DownloadState | undefined>;
};

type Deps = {
  repo: ModelRepo;
  files: ModelFiles;
  transport: DownloadTransport;
  catalog: () => CatalogModel[];
};

export function createModelStore({ repo, files, transport, catalog }: Deps) {
  const store = createStore<ModelStoreState>()(() => ({
    ready: false,
    downloadedIds: [],
    paths: {},
    downloads: {},
  }));
  let modelsDir = '';
  const order: string[] = [];

  const find = (id: string) => catalog().find((m) => m.id === id);
  const dirOf = (id: string) => `${modelsDir}/${id}`;
  const partialOf = (id: string) => `${dirOf(id)}/${PARTIAL_FILE}`;
  const finalOf = (id: string) => `${dirOf(id)}/${MODEL_FILE}`;

  function dispatch(id: string, event: DownloadEvent) {
    const downloads = store.getState().downloads;
    const next = reduceDownload(downloads[id], event);
    if (next !== downloads[id])
      store.setState({ downloads: { ...downloads, [id]: next } });
  }

  function forget(id: string) {
    const { [id]: _removed, ...rest } = store.getState().downloads;
    store.setState({ downloads: rest });
    const index = order.indexOf(id);
    if (index !== -1) order.splice(index, 1);
  }

  async function refreshDownloaded() {
    const rows = await repo.listDownloaded();
    store.setState({
      downloadedIds: rows.map((r) => r.id),
      // The app container moves on updates, so never trust a stored absolute path.
      paths: Object.fromEntries(rows.map((r) => [r.id, finalOf(r.id)])),
    });
  }

  function handlersFor(id: string): TransferHandlers {
    return {
      onProgress: (done, total) =>
        dispatch(id, { type: 'progress', bytesDone: done, bytesTotal: total }),
      onDone: () => {
        transport.complete(id);
        if (store.getState().downloads[id]?.status !== 'downloading') return;
        dispatch(id, { type: 'downloaded' });
        void verify(id);
        pump();
      },
      onError: () => {
        void files.remove(partialOf(id));
        dispatch(id, { type: 'fail', error: 'network' });
        pump();
      },
    };
  }

  async function fail(id: string, error: DownloadErrorKind) {
    await files.remove(partialOf(id)).catch(() => undefined);
    dispatch(id, { type: 'fail', error });
  }

  /** Size, then SHA-256. Only a file that passes both becomes model.gguf. */
  async function verify(id: string) {
    const model = find(id);
    if (!model) return;
    try {
      const size = await files.fileSize(partialOf(id));
      if (size !== model.sizeBytes) return await fail(id, 'size');
      const hash = await files.sha256(partialOf(id));
      if (hash.toLowerCase() !== model.sha256)
        return await fail(id, 'checksum');
      await files.move(partialOf(id), finalOf(id));
      await repo.markDownloaded(id, finalOf(id));
      await refreshDownloaded();
      dispatch(id, { type: 'verified' });
    } catch {
      await fail(id, 'unknown');
    }
  }

  async function startTransfer(id: string) {
    const model = find(id);
    if (!model) return;
    dispatch(id, { type: 'start' });
    try {
      await files.ensureDirectory(dirOf(id));
      await files.remove(partialOf(id));
      // Cancelled while the folder was being prepared.
      if (store.getState().downloads[id]?.status !== 'downloading') return;
      transport.start(
        { id, url: model.url, destination: partialOf(id) },
        handlersFor(id)
      );
    } catch {
      dispatch(id, { type: 'fail', error: 'disk' });
      pump();
    }
  }

  function pump() {
    for (const id of downloadsToStart(store.getState().downloads, order)) {
      void startTransfer(id);
    }
  }

  /** Model folders whose download is not running, so their partial file is stale. */
  async function idleEntries(): Promise<string[]> {
    const downloads = store.getState().downloads;
    const entries = await files.listDirectory(modelsDir);
    return entries.filter((entry) => {
      const status = downloads[entry]?.status;
      return (
        status !== 'downloading' &&
        status !== 'verifying' &&
        status !== 'queued'
      );
    });
  }

  return {
    store,

    /**
     * On launch: reattach background transfers, verify files that finished
     * while Mull was closed, and make the database agree with the disk.
     */
    async init() {
      modelsDir = await files.modelsDirectory();
      const known = new Set(catalog().map((m) => m.id));

      const live = await transport.reattach(handlersFor);
      const liveIds = new Set(live.map((t) => t.id));
      for (const transfer of live) {
        const model = find(transfer.id);
        if (!model) {
          await transport.stop(transfer.id);
          continue;
        }
        order.push(transfer.id);
        dispatch(transfer.id, { type: 'enqueue', bytesTotal: model.sizeBytes });
        dispatch(transfer.id, { type: 'start' });
        dispatch(transfer.id, {
          type: 'progress',
          bytesDone: transfer.bytesDone,
          bytesTotal: transfer.bytesTotal,
        });
      }

      // Database says downloaded, disk disagrees: mark it missing.
      for (const row of await repo.listDownloaded()) {
        if (!(await files.exists(finalOf(row.id))))
          await repo.markNotDownloaded(row.id);
      }
      await refreshDownloaded();
      const downloaded = new Set(store.getState().downloadedIds);

      const toVerify: string[] = [];
      for (const entry of await files.listDirectory(modelsDir)) {
        if (!known.has(entry)) {
          await files.remove(`${modelsDir}/${entry}`);
          continue;
        }
        if (downloaded.has(entry) || liveIds.has(entry)) {
          if (downloaded.has(entry)) await files.remove(partialOf(entry));
          continue;
        }
        if (await files.exists(partialOf(entry))) {
          // The transfer finished while Mull was not running.
          toVerify.push(entry);
        } else {
          await files.remove(dirOf(entry));
        }
      }

      store.setState({ ready: true });
      for (const id of toVerify) {
        const model = find(id)!;
        order.push(id);
        dispatch(id, { type: 'enqueue', bytesTotal: model.sizeBytes });
        dispatch(id, { type: 'start' });
        dispatch(id, { type: 'downloaded' });
        void verify(id);
      }
    },

    download(id: string) {
      const model = find(id);
      if (!model) return;
      const current = store.getState().downloads[id]?.status;
      if (
        current === 'queued' ||
        current === 'downloading' ||
        current === 'verifying'
      )
        return;
      if (store.getState().downloadedIds.includes(id)) return;
      if (!order.includes(id)) order.push(id);
      dispatch(id, { type: 'enqueue', bytesTotal: model.sizeBytes });
      pump();
    },

    async cancel(id: string) {
      const status = store.getState().downloads[id]?.status;
      if (status === 'verifying') return;
      if (status === 'downloading') await transport.stop(id);
      await files.remove(partialOf(id)).catch(() => undefined);
      dispatch(id, { type: 'cancel' });
      forget(id);
      pump();
    },

    /** Clears a finished or failed entry so the row returns to its plain state. */
    dismiss(id: string) {
      const status = store.getState().downloads[id]?.status;
      if (status === 'done' || status === 'failed' || status === 'cancelled')
        forget(id);
    },

    /** Deletes a model's files. Chats that used it keep their history. */
    async remove(id: string) {
      await files.remove(dirOf(id));
      await repo.markNotDownloaded(id);
      forget(id);
      await refreshDownloaded();
    },

    /** Removes leftover partial files of transfers that are no longer running. */
    /** Unfinished download files that no transfer is writing to. */
    async idlePartials(): Promise<string[]> {
      return (await idleEntries()).map(partialOf);
    },

    async clearPartials() {
      for (const entry of await idleEntries()) {
        await files.remove(partialOf(entry));
        if (!store.getState().downloadedIds.includes(entry))
          await files.remove(dirOf(entry));
      }
    },

    modelsDirectory: () => modelsDir,
  };
}

export type ModelController = ReturnType<typeof createModelStore>;
