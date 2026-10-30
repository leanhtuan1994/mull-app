import type { CatalogModel } from '@/features/models/catalog-schema';

import type { Db, ModelRow } from '../types';

export function createModelRepo(db: Db) {
  return {
    /** Upserts catalog metadata, keeping download state. */
    async syncCatalog(models: CatalogModel[], catalogVersion: number) {
      await db.withTransactionAsync(async () => {
        for (const m of models) {
          await db.runAsync(
            `INSERT INTO models (id, catalogVersion, name, family, params, sizeBytes, sha256, contextTokens, quant)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               catalogVersion = excluded.catalogVersion, name = excluded.name,
               family = excluded.family, params = excluded.params,
               sizeBytes = excluded.sizeBytes, sha256 = excluded.sha256,
               contextTokens = excluded.contextTokens, quant = excluded.quant`,
            [
              m.id,
              catalogVersion,
              m.name,
              m.family,
              m.params,
              m.sizeBytes,
              m.sha256,
              m.contextTokens,
              m.quant,
            ]
          );
        }
      });
    },

    list() {
      return db.getAllAsync<ModelRow>(
        'SELECT * FROM models ORDER BY sizeBytes'
      );
    },

    listDownloaded() {
      return db.getAllAsync<ModelRow>(
        'SELECT * FROM models WHERE isDownloaded = 1 ORDER BY sizeBytes'
      );
    },

    get(id: string) {
      return db.getFirstAsync<ModelRow>('SELECT * FROM models WHERE id = ?', [
        id,
      ]);
    },

    async markDownloaded(id: string, localPath: string, at = Date.now()) {
      await db.runAsync(
        'UPDATE models SET isDownloaded = 1, localPath = ?, downloadedAt = ? WHERE id = ?',
        [localPath, at, id]
      );
    },

    async markNotDownloaded(id: string) {
      await db.runAsync(
        'UPDATE models SET isDownloaded = 0, localPath = NULL, downloadedAt = NULL WHERE id = ?',
        [id]
      );
    },
  };
}

export type ModelRepo = ReturnType<typeof createModelRepo>;
