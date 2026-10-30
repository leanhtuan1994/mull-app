import { requireNativeModule } from 'expo';

type MullFilesNative = {
  modelsDirectory(): Promise<string>;
  ensureDirectory(path: string): Promise<void>;
  isExcludedFromBackup(path: string): Promise<boolean>;
  sha256(path: string): Promise<string>;
  /** -1 when the file does not exist. */
  fileSize(path: string): Promise<number>;
  exists(path: string): Promise<boolean>;
  listDirectory(path: string): Promise<string[]>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  directorySize(path: string): Promise<number>;
  appDirectories(): Promise<{
    documents: string;
    caches: string;
    temporary: string;
  }>;
  clearCaches(): Promise<number>;
  diskSpace(): Promise<{ free: number; total: number }>;
};

export const MullFiles = requireNativeModule<MullFilesNative>('MullFiles');
export type { MullFilesNative };
