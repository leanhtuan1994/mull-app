import { createStore } from 'zustand/vanilla';

import type { Repos } from '@/db/repos';
import type { AttachmentRow } from '@/db/types';
import {
  type EmbeddingModel,
  EmbeddingSkippedError,
  type LlmController,
} from '@/features/llm/llm-store';

import type { MullFilesNative } from '../../../modules/mull-files';
import { chunkDocument, type PageText } from './chunk';

/** Small batches keep a question waiting at most one batch behind indexing. */
const EMBED_BATCH = 8;
/**
 * At most this many passages per document (about 200k tokens): enough for a
 * book chapter, and it keeps search memory small while a 4B model is loaded.
 */
const MAX_CHUNKS = 600;
/** A document that fails this often is marked unreadable instead of retried forever. */
const MAX_ATTEMPTS = 3;

export type IngestProgress = {
  status: AttachmentRow['status'];
  /** 0–1 while embedding. */
  fraction: number;
  error?: IngestError;
};

export type IngestError = 'no_text' | 'unreadable';

type Deps = {
  repos: () => Repos;
  files: Pick<MullFilesNative, 'pdfText' | 'readText'>;
  llm: Pick<LlmController, 'embed'>;
  absolute: (relative: string) => string;
  /** The downloaded embedding model, with its passage prefix, if any. */
  embeddingModel: () => (EmbeddingModel & { documentPrefix: string }) | null;
  /** iOS forbids GPU work in the background; embedding only runs when true. */
  isActive?: () => boolean;
};

/**
 * Reads attached documents into passages and, when an embedding model is on
 * the device, gives each passage a vector. Progress is kept in `store` so
 * the message bubble can show it.
 */
export function createIngest({
  repos,
  files,
  llm,
  absolute,
  embeddingModel,
  isActive = () => true,
}: Deps) {
  const store = createStore<Record<number, IngestProgress>>()(() => ({}));
  const running = new Set<number>();
  const failures = new Map<number, number>();
  const extracting = new Map<number, Promise<void>>();
  let paused = false;
  const canRun = () => !paused && isActive();

  const report = (id: number, progress: IngestProgress) =>
    store.setState({ ...store.getState(), [id]: progress });

  async function readPages(row: AttachmentRow): Promise<PageText[]> {
    const path = absolute(row.path);
    if (row.mime === 'application/pdf') return files.pdfText(path);
    return [{ page: null, text: await files.readText(path) }];
  }

  async function fail(id: number, error: IngestError) {
    await repos().attachments.setStatus(id, 'failed', error);
    report(id, { status: 'failed', fraction: 0, error });
  }

  /** Text → passages. Leaves the document `ready`, with or without vectors. */
  async function extract(row: AttachmentRow) {
    report(row.id, { status: 'extracting', fraction: 0 });
    let pages: PageText[];
    try {
      pages = await readPages(row);
    } catch {
      return fail(row.id, 'unreadable');
    }
    const chunks = chunkDocument(pages).slice(0, MAX_CHUNKS);
    // A scanned PDF has no text layer; OCR is out of scope.
    if (chunks.length === 0) return fail(row.id, 'no_text');
    await repos().chunks.replace(row.id, chunks);
    await repos().attachments.setDocumentInfo(row.id, {
      pageCount: row.mime === 'application/pdf' ? pages.length : null,
      tokenCount: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
    });
    await repos().attachments.setStatus(row.id, 'ready');
    report(row.id, { status: 'ready', fraction: 0 });
  }

  /**
   * Embeds passages that lack a vector from the current model, batch by
   * batch, so it resumes where it stopped after a pause or a relaunch.
   */
  async function embed(id: number) {
    const model = embeddingModel();
    if (!model) return;
    const total = await repos().chunks.countByAttachment(id);
    let pending = await repos().chunks.listUnembedded(id, model.id);
    if (pending.length === 0) return;
    await repos().attachments.setStatus(id, 'embedding');
    while (pending.length > 0 && canRun()) {
      report(id, {
        status: 'embedding',
        fraction: 1 - pending.length / Math.max(1, total),
      });
      const batch = pending.slice(0, EMBED_BATCH);
      const vectors = await llm.embed(
        model,
        batch.map((c) => `${model.documentPrefix}${c.text}`),
        { shouldRun: canRun }
      );
      // The document may have been deleted while this batch ran.
      if (!(await repos().attachments.get(id))) return;
      await repos().chunks.setEmbeddings(
        batch.map((c, i) => ({ id: c.id, embedding: vectors[i] })),
        model.id
      );
      pending = pending.slice(batch.length);
    }
    if (pending.length === 0) {
      await repos().attachments.setStatus(id, 'ready');
      report(id, { status: 'ready', fraction: 1 });
    }
  }

  async function run(id: number) {
    if (running.has(id) || !canRun()) return;
    running.add(id);
    try {
      const row = await repos().attachments.get(id);
      if (!row || row.kind !== 'document') return;
      if (row.status === 'extracting') {
        const done = extract(row);
        extracting.set(id, done);
        await done.finally(() => extracting.delete(id));
      }
      const current = await repos().attachments.get(id);
      if (current && current.status !== 'failed') await embed(id);
      failures.delete(id);
    } catch (error) {
      if (error instanceof EmbeddingSkippedError) return;
      // A passage the model rejects would fail on every launch; give up.
      const count = (failures.get(id) ?? 0) + 1;
      failures.set(id, count);
      if (count >= MAX_ATTEMPTS)
        await fail(id, 'unreadable').catch(() => undefined);
    } finally {
      running.delete(id);
    }
  }

  return {
    store,

    /** Starts reading a newly attached document. */
    start(id: number) {
      void run(id);
    },

    /** Stops after the current batch, for example when Mull leaves the screen. */
    pause() {
      paused = true;
    },

    /**
     * Picks up documents left mid-way, and indexes ready ones once an
     * embedding model is available. Safe to call repeatedly.
     */
    async resume() {
      paused = false;
      if (!isActive()) return;
      const rows = await repos().attachments.listAll();
      for (const row of rows) {
        if (row.kind !== 'document' || row.status === 'failed') continue;
        void run(row.id);
      }
    },

    /** Resolves once these documents have their passages, so a question sees them. */
    async whenExtracted(ids: number[]) {
      await Promise.all(ids.map((id) => extracting.get(id)));
    },

    /** Current progress, falling back to what the database last recorded. */
    progressOf(row: AttachmentRow): IngestProgress {
      return (
        store.getState()[row.id] ?? {
          status: row.status,
          fraction: row.status === 'ready' ? 1 : 0,
          error: (row.error as IngestError | null) ?? undefined,
        }
      );
    },
  };
}

export type Ingest = ReturnType<typeof createIngest>;
