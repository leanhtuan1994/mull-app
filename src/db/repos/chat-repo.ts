import { normalizeVi, toFtsQuery } from '@/lib/normalize-vi';

import type { ChatRow, ChatSearchRow, Db } from '../types';

export const CHAT_TITLE_MAX = 40;

/** The first line of the first message, cut at 40 characters. */
export function titleFromMessage(text: string): string {
  const line = text.trim().split('\n')[0].replace(/\s+/g, ' ');
  const chars = Array.from(line);
  if (chars.length <= CHAT_TITLE_MAX) return line;
  return `${chars
    .slice(0, CHAT_TITLE_MAX - 1)
    .join('')
    .trimEnd()}…`;
}

export function createChatRepo(db: Db) {
  async function indexTitle(chatId: number, title: string) {
    await db.runAsync('DELETE FROM messages_fts WHERE rowid = ?', [-chatId]);
    await db.runAsync(
      'INSERT INTO messages_fts (rowid, chatId, content_norm) VALUES (?, ?, ?)',
      [-chatId, chatId, normalizeVi(title)]
    );
  }

  return {
    async create(input: {
      title: string;
      modelId: string | null;
      systemPrompt: string;
      now?: number;
    }): Promise<number> {
      const now = input.now ?? Date.now();
      let id = 0;
      await db.withTransactionAsync(async () => {
        const result = await db.runAsync(
          'INSERT INTO chats (title, modelId, systemPrompt, createdAt, lastUsed) VALUES (?, ?, ?, ?, ?)',
          [input.title, input.modelId, input.systemPrompt, now, now]
        );
        id = result.lastInsertRowId;
        await indexTitle(id, input.title);
      });
      return id;
    },

    get(id: number) {
      return db.getFirstAsync<ChatRow>('SELECT * FROM chats WHERE id = ?', [
        id,
      ]);
    },

    list() {
      return db.getAllAsync<ChatRow>(
        'SELECT * FROM chats ORDER BY lastUsed DESC'
      );
    },

    async rename(id: number, title: string) {
      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE chats SET title = ? WHERE id = ?', [
          title,
          id,
        ]);
        await indexTitle(id, title);
      });
    },

    async setModel(id: number, modelId: string | null) {
      await db.runAsync('UPDATE chats SET modelId = ? WHERE id = ?', [
        modelId,
        id,
      ]);
    },

    async touch(id: number, now = Date.now()) {
      await db.runAsync('UPDATE chats SET lastUsed = ? WHERE id = ?', [
        now,
        id,
      ]);
    },

    async remove(id: number) {
      await db.runAsync('DELETE FROM chats WHERE id = ?', [id]);
    },

    async removeAll() {
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM chats');
        await db.runAsync('DELETE FROM messages_fts');
      });
    },

    /**
     * Chats whose title or messages contain every word, ignoring accents and
     * case, with the newest matching message for a preview.
     */
    async search(query: string): Promise<ChatSearchRow[]> {
      const match = toFtsQuery(query);
      if (!match) return [];
      return db.getAllAsync<ChatSearchRow>(
        `WITH hits AS (
           SELECT rowid AS id, chatId FROM messages_fts WHERE messages_fts MATCH ?
         )
         SELECT c.*,
           (SELECT m.content FROM messages m
            WHERE m.id IN (SELECT id FROM hits WHERE hits.chatId = c.id)
            ORDER BY m.id DESC LIMIT 1) AS matchText
         FROM chats c
         WHERE c.id IN (SELECT chatId FROM hits)
         ORDER BY c.lastUsed DESC
         LIMIT 100`,
        [match]
      );
    },
  };
}

export type ChatRepo = ReturnType<typeof createChatRepo>;
