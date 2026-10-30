import { readStorageStats } from './storage-stats';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

describe('readStorageStats', () => {
  it('splits storage into models, Mull data, other apps and free space', async () => {
    const directories: Record<string, number> = {
      '/docs': 5 * MB,
      '/caches': 8 * MB,
      '/tmp': 1 * MB,
    };
    const files: Record<string, number> = {
      '/models/a/model.gguf': 2 * GB,
      '/models/b/model.gguf': 1 * GB,
      '/models/c/model.gguf.download': 300 * MB,
    };
    const stats = await readStorageStats(
      {
        diskSpace: async () => ({ free: 40 * GB, total: 128 * GB }),
        appDirectories: async () => ({
          documents: '/docs',
          caches: '/caches',
          temporary: '/tmp',
        }),
        directorySize: async (path) => directories[path] ?? 0,
        fileSize: async (path) => files[path] ?? -1,
      },
      {
        complete: ['/models/a/model.gguf', '/models/b/model.gguf'],
        partial: [
          '/models/a/model.gguf.download',
          '/models/c/model.gguf.download',
        ],
      }
    );
    expect(stats.modelsBytes).toBe(3 * GB);
    expect(stats.cacheBytes).toBe(309 * MB);
    expect(stats.dataBytes).toBe(314 * MB);
    expect(stats.freeBytes).toBe(40 * GB);
    expect(stats.otherBytes).toBe(128 * GB - 40 * GB - 3 * GB - 314 * MB);
  });
});
