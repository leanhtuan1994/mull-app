import type { Db } from './types';

/**
 * Each entry upgrades the schema by one version. Never edit a shipped entry;
 * append a new one. `PRAGMA user_version` records how many have run.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE models (
    id TEXT PRIMARY KEY NOT NULL,
    catalogVersion INTEGER NOT NULL,
    name TEXT NOT NULL,
    family TEXT NOT NULL,
    params REAL NOT NULL,
    sizeBytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    contextTokens INTEGER NOT NULL,
    quant TEXT NOT NULL,
    isDownloaded INTEGER NOT NULL DEFAULT 0,
    localPath TEXT,
    downloadedAt INTEGER
  );

  CREATE TABLE chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    modelId TEXT REFERENCES models(id) ON DELETE SET NULL,
    systemPrompt TEXT NOT NULL DEFAULT '',
    createdAt INTEGER NOT NULL,
    lastUsed INTEGER NOT NULL
  );
  CREATE INDEX chats_last_used ON chats(lastUsed DESC);

  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    modelName TEXT,
    tokensPerSecond REAL,
    timeToFirstToken INTEGER,
    tokenCount INTEGER,
    stoppedByUser INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    -- JSON: the document passages an answer was given, for source chips.
    sources TEXT,
    createdAt INTEGER NOT NULL
  );
  CREATE INDEX messages_chat ON messages(chatId, id);

  -- Files people attach. A draft has no chat or message yet; sending moves
  -- it under its chat. path and thumbPath are relative to the attachments
  -- folder, because the app container moves on updates.
  CREATE TABLE attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chatId INTEGER REFERENCES chats(id) ON DELETE CASCADE,
    messageId INTEGER REFERENCES messages(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('image', 'document')),
    name TEXT NOT NULL,
    mime TEXT NOT NULL,
    path TEXT NOT NULL,
    thumbPath TEXT,
    sizeBytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    pageCount INTEGER,
    -- Estimated tokens of a document's whole text.
    tokenCount INTEGER,
    status TEXT NOT NULL DEFAULT 'ready'
      CHECK (status IN ('extracting', 'embedding', 'ready', 'failed')),
    error TEXT,
    createdAt INTEGER NOT NULL
  );
  CREATE INDEX attachments_chat ON attachments(chatId);
  CREATE INDEX attachments_message ON attachments(messageId);

  -- Passages of attached documents. embedding is a Float32 vector from
  -- embeddingModelId, or NULL until the embedding model has indexed it.
  CREATE TABLE document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attachmentId INTEGER NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    ord INTEGER NOT NULL,
    page INTEGER,
    text TEXT NOT NULL,
    tokenCount INTEGER NOT NULL,
    embedding BLOB,
    embeddingModelId TEXT,
    UNIQUE (attachmentId, ord)
  );

  CREATE TABLE prompt_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    builtIn INTEGER NOT NULL DEFAULT 0,
    builtInKey TEXT UNIQUE,
    isDefault INTEGER NOT NULL DEFAULT 0,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  -- Accent-folded copies of chat titles and message text. JS writes
  -- normalizeVi() output here; the tokenizer also folds diacritics.
  -- rowid = message id for messages and -chat id for titles, so updates and
  -- deletes hit the rowid instead of scanning the table.
  CREATE VIRTUAL TABLE messages_fts USING fts5(
    chatId UNINDEXED,
    content_norm,
    tokenize = 'unicode61 remove_diacritics 2'
  );

  CREATE TRIGGER chats_delete_fts AFTER DELETE ON chats BEGIN
    DELETE FROM messages_fts WHERE rowid = -old.id;
  END;
  CREATE TRIGGER messages_delete_fts AFTER DELETE ON messages BEGIN
    DELETE FROM messages_fts WHERE rowid = old.id;
  END;
  `,
];

export async function migrate(db: Db): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    const sql = MIGRATIONS[version];
    const next = version + 1;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
      await db.execAsync(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
}
