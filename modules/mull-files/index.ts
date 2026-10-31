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
  attachmentsDirectory(): Promise<string>;
  /** A JPEG no larger than `maxSide` on its longer side, upright. */
  resizeImage(
    path: string,
    outPath: string,
    maxSide: number,
    quality: number
  ): Promise<{ width: number; height: number }>;
  /** Text of each page, 1-based; empty strings for pages without a text layer. */
  pdfText(path: string): Promise<{ page: number; text: string }[]>;
  readText(path: string): Promise<string>;
};

export const MullFiles = requireNativeModule<MullFilesNative>('MullFiles');
export type { MullFilesNative };
