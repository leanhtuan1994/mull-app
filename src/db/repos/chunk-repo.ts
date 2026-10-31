import type { ChunkRow, Db, IndexedChunk } from '../types';

export type NewChunk = Omit<ChunkRow, 'id' | 'attachmentId'>;

/** A chunk with the document it came from, for the source sheet. */
export type SourceChunk = ChunkRow & {
  name: string;
  chatId: number | null;
};

const toBlob = (vector: number[]) =>
  new Uint8Array(new Float32Array(vector).buffer);

function fromBlob(blob: Uint8Array | null): Float32Array | null {
  if (!blob) return null;
  // Copy so the floats are aligned whatever buffer SQLite handed back.
  return new Float32Array(blob.slice().buffer);
}

export function createChunkRepo(db: Db) {
  return {
    /** Replaces a document's passages; a re-read starts from scratch. */
    async replace(attachmentId: number, chunks: NewChunk[]) {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          'DELETE FROM document_chunks WHERE attachmentId = ?',
          [attachmentId]
        );
        for (const chunk of chunks) {
          await db.runAsync(
            `INSERT INTO document_chunks (attachmentId, ord, page, text, tokenCount)
             VALUES (?, ?, ?, ?, ?)`,
            [attachmentId, chunk.ord, chunk.page, chunk.text, chunk.tokenCount]
          );
        }
      });
    },

    async countByAttachment(attachmentId: number) {
      const row = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) AS n FROM document_chunks WHERE attachmentId = ?',
        [attachmentId]
      );
      return row?.n ?? 0;
    },

    listByAttachment(attachmentId: number) {
      return db.getAllAsync<ChunkRow>(
        `SELECT id, attachmentId, ord, page, text, tokenCount FROM document_chunks
         WHERE attachmentId = ? ORDER BY ord`,
        [attachmentId]
      );
    },

    /** Passages that still need a vector from `modelId`, in reading order. */
    listUnembedded(attachmentId: number, modelId: string) {
      return db.getAllAsync<ChunkRow>(
        `SELECT id, attachmentId, ord, page, text, tokenCount FROM document_chunks
         WHERE attachmentId = ?
           AND (embedding IS NULL OR embeddingModelId IS NOT ?)
         ORDER BY ord`,
        [attachmentId, modelId]
      );
    },

    /** Stores vectors in place, so chunk ids (and citations) stay valid. */
    async setEmbeddings(
      rows: { id: number; embedding: number[] }[],
      modelId: string
    ) {
      await db.withTransactionAsync(async () => {
        for (const row of rows) {
          await db.runAsync(
            'UPDATE document_chunks SET embedding = ?, embeddingModelId = ? WHERE id = ?',
            [toBlob(row.embedding), modelId, row.id]
          );
        }
      });
    },

    /** Every passage of the documents sent in a chat, with vectors. */
    async listForChat(chatId: number): Promise<IndexedChunk[]> {
      const rows = await db.getAllAsync<
        ChunkRow & {
          embedding: Uint8Array | null;
          embeddingModelId: string | null;
        }
      >(
        `SELECT c.id, c.attachmentId, c.ord, c.page, c.text, c.tokenCount,
                c.embedding, c.embeddingModelId
         FROM document_chunks c JOIN attachments a ON a.id = c.attachmentId
         WHERE a.chatId = ? AND a.messageId IS NOT NULL
         ORDER BY c.attachmentId, c.ord`,
        [chatId]
      );
      return rows.map(({ embeddingModelId: _model, ...row }) => ({
        ...row,
        embedding: fromBlob(row.embedding),
      }));
    },

    /** One passage and its document, or null once deleted. */
    getSource(id: number) {
      return db.getFirstAsync<SourceChunk>(
        `SELECT c.id, c.attachmentId, c.ord, c.page, c.text, c.tokenCount,
                a.name, a.chatId
         FROM document_chunks c JOIN attachments a ON a.id = c.attachmentId
         WHERE c.id = ?`,
        [id]
      );
    },
  };
}

export type ChunkRepo = ReturnType<typeof createChunkRepo>;
