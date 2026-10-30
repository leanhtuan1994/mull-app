import type { MullFilesNative } from '../../../modules/mull-files';

export type StorageStats = {
  modelsBytes: number;
  /** Chats database plus caches and temporary files. */
  dataBytes: number;
  cacheBytes: number;
  otherBytes: number;
  freeBytes: number;
  totalBytes: number;
};

type Files = Pick<
  MullFilesNative,
  'diskSpace' | 'directorySize' | 'appDirectories' | 'fileSize'
>;

/**
 * Splits the device's storage into Mull's models, Mull's data, everything
 * else and free space. Models count at their file size, the same figure the
 * rest of the app shows; unfinished downloads count as cache because
 * clearing the cache removes them.
 */
export async function readStorageStats(
  files: Files,
  modelFiles: { complete: string[]; partial: string[] }
): Promise<StorageStats> {
  const [{ free, total }, dirs] = await Promise.all([
    files.diskSpace(),
    files.appDirectories(),
  ]);
  const [modelsBytes, partialBytes, documentsBytes, cachesBytes, tempBytes] =
    await Promise.all([
      sumFileSizes(files, modelFiles.complete),
      sumFileSizes(files, modelFiles.partial),
      files.directorySize(dirs.documents),
      files.directorySize(dirs.caches),
      files.directorySize(dirs.temporary),
    ]);
  const cacheBytes = cachesBytes + tempBytes + partialBytes;
  const dataBytes = documentsBytes + cacheBytes;
  return {
    modelsBytes,
    dataBytes,
    cacheBytes,
    freeBytes: free,
    totalBytes: total,
    otherBytes: Math.max(0, total - free - modelsBytes - dataBytes),
  };
}

async function sumFileSizes(files: Files, paths: string[]): Promise<number> {
  const sizes = await Promise.all(paths.map((path) => files.fileSize(path)));
  // fileSize reports -1 for a missing file.
  return sizes.reduce((sum, size) => sum + Math.max(0, size), 0);
}
