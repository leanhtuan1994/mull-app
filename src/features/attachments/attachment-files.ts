import type { Repos } from '@/db/repos';
import type { AttachmentRow } from '@/db/types';

import type { MullFilesNative } from '../../../modules/mull-files';

type Files = Pick<
  MullFilesNative,
  | 'attachmentsDirectory'
  | 'ensureDirectory'
  | 'exists'
  | 'fileSize'
  | 'listDirectory'
  | 'move'
  | 'remove'
  | 'resizeImage'
>;

/** Longer side of the stored image; the vision projector caps tokens itself. */
export const IMAGE_MAX_SIDE = 1536;
const THUMB_MAX_SIDE = 320;
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Drafts older than this were abandoned (picked, then never sent). */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFTS = 'drafts';

export class DocumentTooLargeError extends Error {
  constructor() {
    super('Document is larger than 20 MB');
    this.name = 'DocumentTooLargeError';
  }
}

const stripFileUrl = (uri: string) =>
  decodeURIComponent(uri.replace(/^file:\/\//, ''));

/** Keeps letters (accents included), digits, dot, dash and underscore. */
function safeFileName(name: string) {
  const cleaned = name.replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(-80);
  return cleaned.replace(/^[.-]+/, '') || 'file';
}

type Deps = {
  repos: () => Repos;
  files: Files;
  newId: () => string;
  now?: () => number;
};

/**
 * Where attached files live: `attachments/drafts/<id>/` until sent, then
 * `attachments/<chat id>/<id>/`. The database stores paths relative to the
 * attachments folder, because the app container moves on updates.
 */
export function createAttachmentFiles({
  repos,
  files,
  newId,
  now = Date.now,
}: Deps) {
  let root = '';

  const absolute = (relative: string) => `${root}/${relative}`;

  const folderOf = (relative: string) =>
    relative.split('/').slice(0, 2).join('/');

  /** Moves `drafts/<id>` to the folder `relative` now points at, if still needed. */
  async function moveIntoPlace(relative: string) {
    const folder = folderOf(relative);
    const draft = `${DRAFTS}/${folder.split('/')[1]}`;
    if (folder === draft || (await files.exists(absolute(folder)))) return;
    if (await files.exists(absolute(draft)))
      await files.move(absolute(draft), absolute(folder));
  }

  async function removeFolder(row: AttachmentRow) {
    const folder = row.path.split('/').slice(0, 2).join('/');
    await files.remove(absolute(folder)).catch(() => undefined);
  }

  return {
    /** Drops stale drafts and folders that no row points at. */
    async init() {
      root = await files.attachmentsDirectory();
      for (const row of await repos().attachments.listDrafts(
        now() - DRAFT_TTL_MS
      )) {
        await removeFolder(row);
        await repos().attachments.remove(row.id);
      }
      const rows = await repos().attachments.listAll();
      // Finish moves that a crash interrupted.
      for (const row of rows) await moveIntoPlace(row.path);
      const used = new Set(rows.map((row) => folderOf(row.path)));
      for (const top of await files.listDirectory(root)) {
        for (const id of await files.listDirectory(absolute(top))) {
          if (!used.has(`${top}/${id}`))
            await files.remove(absolute(`${top}/${id}`));
        }
      }
    },

    absolute,

    /**
     * Stores a picked photo as a draft: a JPEG of at most 1536 px plus a
     * thumbnail. The picker's temporary copy is deleted.
     */
    async addImage(uri: string, name: string): Promise<AttachmentRow> {
      const folder = `${DRAFTS}/${newId()}`;
      await files.ensureDirectory(absolute(folder));
      const source = stripFileUrl(uri);
      const path = `${folder}/image.jpg`;
      const thumbPath = `${folder}/thumb.jpg`;
      const { width, height } = await files.resizeImage(
        source,
        absolute(path),
        IMAGE_MAX_SIDE,
        0.85
      );
      await files.resizeImage(source, absolute(thumbPath), THUMB_MAX_SIDE, 0.7);
      await files.remove(source).catch(() => undefined);
      const id = await repos().attachments.addDraft({
        kind: 'image',
        name,
        mime: 'image/jpeg',
        path,
        thumbPath,
        sizeBytes: Math.max(0, await files.fileSize(absolute(path))),
        width,
        height,
      });
      return (await repos().attachments.get(id))!;
    },

    /** Moves a picked document into a draft folder; it is read afterwards. */
    async addDocument(
      uri: string,
      name: string,
      mime: string
    ): Promise<AttachmentRow> {
      const source = stripFileUrl(uri);
      const size = await files.fileSize(source);
      if (size > MAX_DOCUMENT_BYTES) {
        await files.remove(source).catch(() => undefined);
        throw new DocumentTooLargeError();
      }
      const folder = `${DRAFTS}/${newId()}`;
      await files.ensureDirectory(absolute(folder));
      const path = `${folder}/${safeFileName(name)}`;
      await files.move(source, absolute(path));
      const id = await repos().attachments.addDraft({
        kind: 'document',
        name,
        mime,
        path,
        sizeBytes: Math.max(0, size),
        status: 'extracting',
      });
      return (await repos().attachments.get(id))!;
    },

    /** Deletes a draft the person removed before sending. */
    async discardDraft(id: number) {
      const row = await repos().attachments.get(id);
      if (!row || row.messageId !== null) return;
      await removeFolder(row);
      await repos().attachments.remove(id);
    },

    /**
     * Links sent drafts to their message, then moves their folders under the
     * chat. The rows change first: if Mull dies before a move, `init`
     * finishes it instead of treating the moved files as orphans.
     */
    async attachDrafts(
      ids: number[],
      target: { chatId: number; messageId: number }
    ) {
      const rows = (await repos().attachments.listByIds(ids)).filter(
        (row) => row.messageId === null
      );
      const rename = (p: string) => p.replace(/^drafts\//, `${target.chatId}/`);
      await repos().attachments.attach(
        rows.map((row) => ({
          id: row.id,
          path: rename(row.path),
          thumbPath: row.thumbPath && rename(row.thumbPath),
        })),
        target
      );
      await files.ensureDirectory(absolute(String(target.chatId)));
      for (const row of rows) await moveIntoPlace(rename(row.path));
    },

    /** Deletes the files of one chat; its rows go with the chat itself. */
    async removeChatFiles(chatId: number) {
      await files.remove(absolute(String(chatId))).catch(() => undefined);
    },

    /** Deletes the files of every chat. Drafts in an open composer stay. */
    async removeAllFiles() {
      for (const entry of await files.listDirectory(root)) {
        if (entry === DRAFTS) continue;
        await files.remove(absolute(entry)).catch(() => undefined);
      }
    },
  };
}

export type AttachmentFiles = ReturnType<typeof createAttachmentFiles>;
