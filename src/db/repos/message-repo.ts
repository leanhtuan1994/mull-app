import { normalizeVi } from '@/lib/normalize-vi';

import type { Db, MessageRole, MessageRow, SqlValue } from '../types';

export type MessageMetrics = {
  tokensPerSecond?: number | null;
  timeToFirstToken?: number | null;
  tokenCount?: number | null;
  stoppedByUser?: boolean;
  error?: string | null;
};

export type NewMessage = MessageMetrics & {
  chatId: number;
  role: MessageRole;
  content: string;
  modelName?: string | null;
  now?: number;
};

export function createMessageRepo(db: Db) {
  async function reindex(chatId: number, messageId: number, content: string) {
    await db.runAsync('DELETE FROM messages_fts WHERE rowid = ?', [messageId]);
    const folded = normalizeVi(content);
    if (!folded) return;
    await db.runAsync(
      'INSERT INTO messages_fts (rowid, chatId, content_norm) VALUES (?, ?, ?)',
      [messageId, chatId, folded]
    );
  }

  return {
    async add(message: NewMessage): Promise<number> {
      let id = 0;
      await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
          `INSERT INTO messages (chatId, role, content, modelName, tokensPerSecond,
             timeToFirstToken, tokenCount, stoppedByUser, error, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            message.chatId,
            message.role,
            message.content,
            message.modelName ?? null,
            message.tokensPerSecond ?? null,
            message.timeToFirstToken ?? null,
            message.tokenCount ?? null,
            message.stoppedByUser ? 1 : 0,
            message.error ?? null,
            message.now ?? Date.now(),
          ]
        );
        id = result.lastInsertRowId;
        await reindex(message.chatId, id, message.content);
      });
      return id;
    },

    /** Writes a finished (or stopped) answer in one go, after streaming ends. */
    async complete(
      id: number,
      update: MessageMetrics & { content: string; modelName?: string | null }
    ) {
      const row = await db.getFirstAsync<{ chatId: number }>(
        'SELECT chatId FROM messages WHERE id = ?',
        [id]
      );
      if (!row) return;
      const fields: [string, SqlValue][] = [
        ['content', update.content],
        ['tokensPerSecond', update.tokensPerSecond ?? null],
        ['timeToFirstToken', update.timeToFirstToken ?? null],
        ['tokenCount', update.tokenCount ?? null],
        ['stoppedByUser', update.stoppedByUser ? 1 : 0],
        ['error', update.error ?? null],
      ];
      if (update.modelName !== undefined)
        fields.push(['modelName', update.modelName]);
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `UPDATE messages SET ${fields.map(([name]) => `${name} = ?`).join(', ')} WHERE id = ?`,
          [...fields.map(([, value]) => value), id]
        );
        await reindex(row.chatId, id, update.content);
      });
    },

    listByChat(chatId: number) {
      return db.getAllAsync<MessageRow>(
        'SELECT * FROM messages WHERE chatId = ? ORDER BY id',
        [chatId]
      );
    },

    get(id: number) {
      return db.getFirstAsync<MessageRow>(
        'SELECT * FROM messages WHERE id = ?',
        [id]
      );
    },

    async remove(id: number) {
      await db.runAsync('DELETE FROM messages WHERE id = ?', [id]);
    },
  };
}

export type MessageRepo = ReturnType<typeof createMessageRepo>;
