import type {
  AttachmentKind,
  AttachmentRow,
  AttachmentStatus,
  Db,
} from '../types';

export type NewAttachment = {
  kind: AttachmentKind;
  name: string;
  mime: string;
  /** Relative to the attachments folder. */
  path: string;
  thumbPath?: string | null;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  status?: AttachmentStatus;
  now?: number;
};

export function createAttachmentRepo(db: Db) {
  return {
    /** A picked file that belongs to no chat until it is sent. */
    async addDraft(input: NewAttachment): Promise<number> {
      const result = await db.runAsync(
        `INSERT INTO attachments (kind, name, mime, path, thumbPath, sizeBytes,
           width, height, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.kind,
          input.name,
          input.mime,
          input.path,
          input.thumbPath ?? null,
          input.sizeBytes,
          input.width ?? null,
          input.height ?? null,
          input.status ?? 'ready',
          input.now ?? Date.now(),
        ]
      );
      return result.lastInsertRowId;
    },

    get(id: number) {
      return db.getFirstAsync<AttachmentRow>(
        'SELECT * FROM attachments WHERE id = ?',
        [id]
      );
    },

    listByIds(ids: number[]) {
      if (ids.length === 0) return Promise.resolve([]);
      return db.getAllAsync<AttachmentRow>(
        `SELECT * FROM attachments WHERE id IN (${ids.map(() => '?').join(', ')})
         ORDER BY id`,
        ids
      );
    },

    /** Everything sent in a chat, oldest first, in one query. */
    listByChat(chatId: number) {
      return db.getAllAsync<AttachmentRow>(
        `SELECT * FROM attachments WHERE chatId = ? AND messageId IS NOT NULL
         ORDER BY id`,
        [chatId]
      );
    },

    /** Gives sent drafts their chat, message and new location. */
    async attach(
      moves: { id: number; path: string; thumbPath: string | null }[],
      target: { chatId: number; messageId: number }
    ) {
      await db.withTransactionAsync(async () => {
        for (const move of moves) {
          await db.runAsync(
            `UPDATE attachments SET chatId = ?, messageId = ?, path = ?, thumbPath = ?
             WHERE id = ?`,
            [
              target.chatId,
              target.messageId,
              move.path,
              move.thumbPath,
              move.id,
            ]
          );
        }
      });
    },

    async setStatus(id: number, status: AttachmentStatus, error?: string) {
      await db.runAsync(
        'UPDATE attachments SET status = ?, error = ? WHERE id = ?',
        [status, error ?? null, id]
      );
    },

    async setDocumentInfo(
      id: number,
      info: { pageCount: number | null; tokenCount: number }
    ) {
      await db.runAsync(
        'UPDATE attachments SET pageCount = ?, tokenCount = ? WHERE id = ?',
        [info.pageCount, info.tokenCount, id]
      );
    },

    async remove(id: number) {
      await db.runAsync('DELETE FROM attachments WHERE id = ?', [id]);
    },

    /** Drafts picked before `before` and never sent. */
    listDrafts(before: number) {
      return db.getAllAsync<AttachmentRow>(
        'SELECT * FROM attachments WHERE messageId IS NULL AND createdAt < ?',
        [before]
      );
    },

    /** Documents whose reading was cut short, for example by closing Mull. */
    listUnfinished() {
      return db.getAllAsync<AttachmentRow>(
        `SELECT * FROM attachments
         WHERE kind = 'document' AND status IN ('extracting', 'embedding')
         ORDER BY id`
      );
    },

    listAll() {
      return db.getAllAsync<AttachmentRow>('SELECT * FROM attachments');
    },
  };
}

export type AttachmentRepo = ReturnType<typeof createAttachmentRepo>;
