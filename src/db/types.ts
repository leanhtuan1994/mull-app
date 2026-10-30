export type SqlValue = string | number | null;

/**
 * The slice of expo-sqlite's `SQLiteDatabase` the repositories use. Tests
 * back it with Node's built-in SQLite so the real SQL runs in memory.
 */
export type Db = {
  execAsync(source: string): Promise<void>;
  runAsync(
    source: string,
    params?: SqlValue[]
  ): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(source: string, params?: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params?: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
};

export type ModelRow = {
  id: string;
  catalogVersion: number;
  name: string;
  family: string;
  params: number;
  sizeBytes: number;
  sha256: string;
  contextTokens: number;
  quant: string;
  isDownloaded: number;
  localPath: string | null;
  downloadedAt: number | null;
};

export type ChatRow = {
  id: number;
  title: string;
  modelId: string | null;
  systemPrompt: string;
  createdAt: number;
  lastUsed: number;
};

/** A search result; `matchText` is the newest matching message, if any. */
export type ChatSearchRow = ChatRow & { matchText: string | null };

export type MessageRole = 'user' | 'assistant';

export type MessageRow = {
  id: number;
  chatId: number;
  role: MessageRole;
  content: string;
  modelName: string | null;
  tokensPerSecond: number | null;
  timeToFirstToken: number | null;
  tokenCount: number | null;
  stoppedByUser: number;
  error: string | null;
  createdAt: number;
};

export type PresetRow = {
  id: number;
  name: string;
  content: string;
  builtIn: number;
  builtInKey: string | null;
  isDefault: number;
  sortOrder: number;
};
