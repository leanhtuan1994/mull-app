import type { Db, PresetRow } from '../types';

export type BuiltInPreset = {
  key: string;
  name: string;
  content: string;
  isDefault?: boolean;
};

export class BuiltInPresetError extends Error {
  constructor() {
    super('Built-in presets cannot be deleted');
    this.name = 'BuiltInPresetError';
  }
}

export function createPresetRepo(db: Db) {
  return {
    list() {
      return db.getAllAsync<PresetRow>(
        'SELECT * FROM prompt_presets ORDER BY sortOrder, id'
      );
    },

    get(id: number) {
      return db.getFirstAsync<PresetRow>(
        'SELECT * FROM prompt_presets WHERE id = ?',
        [id]
      );
    },

    getDefault() {
      return db.getFirstAsync<PresetRow>(
        'SELECT * FROM prompt_presets ORDER BY isDefault DESC, sortOrder, id LIMIT 1'
      );
    },

    /** Inserts missing built-ins. Safe to run on every launch. */
    async seed(builtIns: BuiltInPreset[]) {
      await db.withTransactionAsync(async () => {
        const existing = await db.getFirstAsync<{ n: number }>(
          'SELECT COUNT(*) AS n FROM prompt_presets'
        );
        const firstRun = (existing?.n ?? 0) === 0;
        for (const [index, preset] of builtIns.entries()) {
          await db.runAsync(
            `INSERT INTO prompt_presets (name, content, builtIn, builtInKey, isDefault, sortOrder)
             VALUES (?, ?, 1, ?, ?, ?)
             ON CONFLICT(builtInKey) DO NOTHING`,
            [
              preset.name,
              preset.content,
              preset.key,
              firstRun && preset.isDefault ? 1 : 0,
              index,
            ]
          );
        }
      });
    },

    async create(input: { name: string; content: string }): Promise<number> {
      const last = await db.getFirstAsync<{ n: number | null }>(
        'SELECT MAX(sortOrder) AS n FROM prompt_presets'
      );
      const result = await db.runAsync(
        'INSERT INTO prompt_presets (name, content, builtIn, sortOrder) VALUES (?, ?, 0, ?)',
        [input.name, input.content, (last?.n ?? 0) + 1]
      );
      return result.lastInsertRowId;
    },

    async update(id: number, input: { name: string; content: string }) {
      await db.runAsync(
        'UPDATE prompt_presets SET name = ?, content = ? WHERE id = ?',
        [input.name, input.content, id]
      );
    },

    async remove(id: number) {
      const preset = await db.getFirstAsync<PresetRow>(
        'SELECT * FROM prompt_presets WHERE id = ?',
        [id]
      );
      if (!preset) return;
      if (preset.builtIn) throw new BuiltInPresetError();
      await db.withTransactionAsync(async () => {
        await db.runAsync('DELETE FROM prompt_presets WHERE id = ?', [id]);
        if (preset.isDefault) {
          await db.runAsync(
            `UPDATE prompt_presets SET isDefault = 1
             WHERE id = (SELECT id FROM prompt_presets ORDER BY builtIn DESC, sortOrder, id LIMIT 1)`
          );
        }
      });
    },

    async setDefault(id: number) {
      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE prompt_presets SET isDefault = 0');
        await db.runAsync(
          'UPDATE prompt_presets SET isDefault = 1 WHERE id = ?',
          [id]
        );
      });
    },

    /** Restores a built-in preset's original name and text. */
    async resetBuiltIn(id: number, builtIns: BuiltInPreset[]) {
      const preset = await db.getFirstAsync<PresetRow>(
        'SELECT * FROM prompt_presets WHERE id = ?',
        [id]
      );
      const original = builtIns.find((b) => b.key === preset?.builtInKey);
      if (!original) return;
      await db.runAsync(
        'UPDATE prompt_presets SET name = ?, content = ? WHERE id = ?',
        [original.name, original.content, id]
      );
    },
  };
}

export type PresetRepo = ReturnType<typeof createPresetRepo>;
