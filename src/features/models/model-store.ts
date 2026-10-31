import { createStore } from 'zustand/vanilla';

import type { ModelRepo } from '@/db/repos';

import type { MullFilesNative } from '../../../modules/mull-files';
import { type ModelFile, modelFiles, totalBytes } from './catalog';
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
/** A file is written under this suffix until its size and hash check out. */
export const PARTIAL_SUFFIX = '.download';
export const PARTIAL_FILE = `${MODEL_FILE}${PARTIAL_SUFFIX}`;

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
  /** Ids of models whose verified files are all on disk. */
  downloadedIds: string[];
  /** The downloaded ones people can chat with (not embedding models). */
  downloadedChatIds: string[];
  /** Absolute paths of verified weight files. */
  paths: Record<string, string>;
  downloads: Record<string, DownloadState | undefined>;
};

type Deps = {
  repo: ModelRepo;
  files: ModelFiles;
  transport: DownloadTransport;
  catalog: () => CatalogModel[];
};

/** Transfers are per file: `<model id>/<file key>`. */
function transferId(modelId: string, key: ModelFile['key']) {
  return `${modelId}/${key}`;
}

function parseTransferId(id: string) {
  const [modelId, key = 'model'] = id.split('/');
  return { modelId, key };
}

export function createModelStore({ repo, files, transport, catalog }: Deps) {
  const store = createStore<ModelStoreState>()(() => ({
    ready: false,
    downloadedIds: [],
    downloadedChatIds: [],
    paths: {},
    downloads: {},
  }));
  let modelsDir = '';
  const order: string[] = [];
  /** The file each model is transferring right now. */
  const activeFile = new Map<string, ModelFile['key']>();

  const find = (id: string) => catalog().find((m) => m.id === id);
  const dirOf = (id: string) => `${modelsDir}/${id}`;
  const finalOf = (id: string, file: ModelFile) =>
    `${dirOf(id)}/${file.fileName}`;
  const partialOf = (id: string, file: ModelFile) =>
    `${finalOf(id, file)}${PARTIAL_SUFFIX}`;
  const filesOf = (id: string) => {
    const model = find(id);
    return model ? modelFiles(model) : [];
  };

  function dispatch(id: string, event: DownloadEvent) {
    const downloads = store.getState().downloads;
    const next = reduceDownload(downloads[id], event);
    if (next !== downloads[id])
      store.setState({ downloads: { ...downloads, [id]: next } });
  }

  const statusOf = (id: string) => store.getState().downloads[id]?.status;

  function forget(id: string) {
    const { [id]: _removed, ...rest } = store.getState().downloads;
    store.setState({ downloads: rest });
    const index = order.indexOf(id);
    if (index !== -1) order.splice(index, 1);
  }

  async function allPresent(id: string) {
    for (const file of filesOf(id)) {
      if (!(await files.exists(finalOf(id, file)))) return false;
    }
    return filesOf(id).length > 0;
  }

  /** Files still to fetch, and the bytes of those already verified. */
  async function remaining(id: string) {
    const missing: ModelFile[] = [];
    let doneBytes = 0;
    for (const file of filesOf(id)) {
      if (await files.exists(finalOf(id, file))) doneBytes += file.sizeBytes;
      else missing.push(file);
    }
    return { missing, doneBytes };
  }

  async function removePartials(id: string) {
    for (const file of filesOf(id)) {
      await files.remove(partialOf(id, file)).catch(() => undefined);
    }
  }

  async function refreshDownloaded() {
    const rows = await repo.listDownloaded();
    const model = (id: string) => find(id);
    store.setState({
      downloadedIds: rows.map((r) => r.id),
      downloadedChatIds: rows
        .map((r) => r.id)
        .filter((id) => model(id)?.kind === 'chat'),
      // The app container moves on updates, so never trust a stored absolute path.
      paths: Object.fromEntries(
        rows.map((r) => [r.id, `${dirOf(r.id)}/${MODEL_FILE}`])
      ),
    });
  }

  /** `offset`: bytes of the model's files already verified, if known. */
  function handlersFor(id: string, offset?: number): TransferHandlers {
    const { modelId, key } = parseTransferId(id);
    const file = filesOf(modelId).find((f) => f.key === key);
    let done = offset ?? 0;
    if (offset === undefined) {
      void remaining(modelId).then((r) => {
        done = r.doneBytes;
      });
    }
    return {
      onProgress: (bytes) => {
        const model = find(modelId);
        if (!model) return;
        dispatch(modelId, {
          type: 'progress',
          bytesDone: done + bytes,
          bytesTotal: totalBytes(model),
        });
      },
      onDone: () => {
        transport.complete(id);
        activeFile.delete(modelId);
        if (statusOf(modelId) !== 'downloading' || !file) return;
        void finishFile(modelId, file);
      },
      onError: () => {
        activeFile.delete(modelId);
        if (file) void files.remove(partialOf(modelId, file));
        dispatch(modelId, { type: 'fail', error: 'network' });
        pump();
      },
    };
  }

  async function fail(id: string, error: DownloadErrorKind) {
    await removePartials(id);
    dispatch(id, { type: 'fail', error });
    pump();
  }

  /** Size, then SHA-256. Only a file that passes both gets its final name. */
  async function verifyFile(
    id: string,
    file: ModelFile
  ): Promise<DownloadErrorKind | null> {
    const size = await files.fileSize(partialOf(id, file));
    if (size !== file.sizeBytes) return 'size';
    const hash = await files.sha256(partialOf(id, file));
    if (hash.toLowerCase() !== file.sha256) return 'checksum';
    await files.move(partialOf(id, file), finalOf(id, file));
    return null;
  }

  async function completeModel(id: string) {
    await repo.markDownloaded(id, `${dirOf(id)}/${MODEL_FILE}`);
    await refreshDownloaded();
    dispatch(id, { type: 'verified' });
    pump();
  }

  /**
   * A transfer finished: verify that file, then fetch the next one, or mark
   * the model downloaded once every file is in place. Only the last file
   * shows the "verifying" state, since that is when the model becomes usable.
   */
  async function finishFile(id: string, file: ModelFile) {
    try {
      const { missing } = await remaining(id);
      const isLast = missing.length === 1 && missing[0].key === file.key;
      if (isLast) dispatch(id, { type: 'downloaded' });
      const error = await verifyFile(id, file);
      if (error) return await fail(id, error);
      if (isLast) return await completeModel(id);
      if (statusOf(id) === 'downloading') await startNextFile(id);
    } catch {
      await fail(id, 'unknown');
    }
  }

  async function startNextFile(id: string) {
    const { missing, doneBytes } = await remaining(id);
    const file = missing[0];
    // Cancelled while the previous file was being checked.
    if (statusOf(id) !== 'downloading') return;
    if (!file) {
      dispatch(id, { type: 'downloaded' });
      return await completeModel(id);
    }
    await files.remove(partialOf(id, file));
    if (statusOf(id) !== 'downloading') return;
    activeFile.set(id, file.key);
    transport.start(
      {
        id: transferId(id, file.key),
        url: file.url,
        destination: partialOf(id, file),
      },
      handlersFor(transferId(id, file.key), doneBytes)
    );
  }

  async function startTransfer(id: string) {
    if (!find(id)) return;
    dispatch(id, { type: 'start' });
    try {
      await files.ensureDirectory(dirOf(id));
      await startNextFile(id);
    } catch {
      dispatch(id, { type: 'fail', error: 'disk' });
      pump();
    }
  }

  function pump() {
    // One transfer per model at a time, so this also caps parallel files.
    for (const id of downloadsToStart(store.getState().downloads, order)) {
      void startTransfer(id);
    }
  }

  /** Model folders whose download is not running, so their partial files are stale. */
  async function idleEntries(): Promise<string[]> {
    const entries = await files.listDirectory(modelsDir);
    return entries.filter((entry) => {
      const status = statusOf(entry);
      return (
        status !== 'downloading' &&
        status !== 'verifying' &&
        status !== 'queued'
      );
    });
  }

  /**
   * Verifies files that finished while Mull was closed. A model that is
   * then complete is marked downloaded; one that still misses a file waits
   * for the person to resume it.
   */
  async function recover(id: string) {
    const model = find(id)!;
    order.push(id);
    dispatch(id, { type: 'enqueue', bytesTotal: totalBytes(model) });
    dispatch(id, { type: 'start' });
    try {
      for (const file of modelFiles(model)) {
        if (!(await files.exists(partialOf(id, file)))) continue;
        const error = await verifyFile(id, file);
        if (error) return await fail(id, error);
      }
      if (await allPresent(id)) {
        dispatch(id, { type: 'downloaded' });
        await completeModel(id);
      } else {
        dispatch(id, { type: 'fail', error: 'network' });
      }
    } catch {
      await fail(id, 'unknown');
    }
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

      const live = await transport.reattach((id) => handlersFor(id));
      const liveIds = new Set<string>();
      for (const transfer of live) {
        const { modelId, key } = parseTransferId(transfer.id);
        const model = find(modelId);
        const file = model && modelFiles(model).find((f) => f.key === key);
        if (!model || !file) {
          await transport.stop(transfer.id);
          continue;
        }
        liveIds.add(modelId);
        activeFile.set(modelId, file.key);
        order.push(modelId);
        const { doneBytes } = await remaining(modelId);
        dispatch(modelId, { type: 'enqueue', bytesTotal: totalBytes(model) });
        dispatch(modelId, { type: 'start' });
        dispatch(modelId, {
          type: 'progress',
          bytesDone: doneBytes + transfer.bytesDone,
          bytesTotal: totalBytes(model),
        });
      }

      // Database says downloaded, disk disagrees: mark it missing.
      for (const row of await repo.listDownloaded()) {
        if (!(await allPresent(row.id))) await repo.markNotDownloaded(row.id);
      }
      await refreshDownloaded();
      const downloaded = new Set(store.getState().downloadedIds);

      const toRecover: string[] = [];
      for (const entry of await files.listDirectory(modelsDir)) {
        if (!known.has(entry)) {
          await files.remove(`${modelsDir}/${entry}`);
          continue;
        }
        if (liveIds.has(entry)) continue;
        if (downloaded.has(entry)) {
          await removePartials(entry);
          continue;
        }
        const { missing } = await remaining(entry);
        let hasPartial = false;
        for (const file of missing) {
          if (await files.exists(partialOf(entry, file))) hasPartial = true;
        }
        if (hasPartial) toRecover.push(entry);
        // Keep verified files of an unfinished model so a retry resumes.
        else if (missing.length === filesOf(entry).length)
          await files.remove(dirOf(entry));
      }

      store.setState({ ready: true });
      for (const id of toRecover) void recover(id);
    },

    download(id: string) {
      const model = find(id);
      if (!model) return;
      const current = statusOf(id);
      if (
        current === 'queued' ||
        current === 'downloading' ||
        current === 'verifying'
      )
        return;
      if (store.getState().downloadedIds.includes(id)) return;
      if (!order.includes(id)) order.push(id);
      dispatch(id, { type: 'enqueue', bytesTotal: totalBytes(model) });
      pump();
    },

    async cancel(id: string) {
      const status = statusOf(id);
      if (status === 'verifying') return;
      const key = activeFile.get(id);
      if (status === 'downloading' && key) {
        activeFile.delete(id);
        await transport.stop(transferId(id, key));
      }
      await removePartials(id);
      dispatch(id, { type: 'cancel' });
      forget(id);
      pump();
    },

    /** Clears a finished or failed entry so the row returns to its plain state. */
    dismiss(id: string) {
      const status = statusOf(id);
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

    /** Unfinished download files that no transfer is writing to. */
    async idlePartials(): Promise<string[]> {
      const out: string[] = [];
      for (const entry of await idleEntries()) {
        for (const file of filesOf(entry)) out.push(partialOf(entry, file));
      }
      return out;
    },

    async clearPartials() {
      for (const entry of await idleEntries()) {
        await removePartials(entry);
        // Keep verified weights of an unfinished model so a retry resumes.
        const { missing } = await remaining(entry);
        if (missing.length === filesOf(entry).length)
          await files.remove(dirOf(entry));
      }
    },

    /** Every verified file of a downloaded model, for storage figures. */
    finalFiles(id: string): string[] {
      return filesOf(id).map((file) => finalOf(id, file));
    },

    /** The vision projector of a downloaded model, if it has one. */
    mmprojPath(id: string): string | undefined {
      const file = filesOf(id).find((f) => f.key === 'mmproj');
      return file && store.getState().downloadedIds.includes(id)
        ? finalOf(id, file)
        : undefined;
    },

    modelsDirectory: () => modelsDir,
  };
}

export type ModelController = ReturnType<typeof createModelStore>;
