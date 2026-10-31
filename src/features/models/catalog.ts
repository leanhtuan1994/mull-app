import bundledCatalog from './catalog.json';
import {
  type Catalog,
  type CatalogModel,
  catalogSchema,
} from './catalog-schema';

let cached: Catalog | null = null;

/**
 * The model catalog. v1 ships it inside the app; a remote source with a cache
 * can be added here later without touching the screens that call this.
 */
export function loadCatalog(): Catalog {
  if (!cached) cached = catalogSchema.parse(bundledCatalog);
  return cached;
}

export function getCatalogModels(): CatalogModel[] {
  return loadCatalog().models;
}

export function findCatalogModel(id: string | null | undefined) {
  if (!id) return undefined;
  return getCatalogModels().find((model) => model.id === id);
}

/** Models people chat with; embedding models only index documents. */
export function getChatModels(): CatalogModel[] {
  return getCatalogModels().filter((model) => model.kind === 'chat');
}

export type ModelFile = {
  key: 'model' | 'mmproj';
  /** Name inside the model's folder once verified. */
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
};

/** Every file a model needs, in download order: the weights first. */
export function modelFiles(
  model: Pick<CatalogModel, 'url' | 'sha256' | 'sizeBytes' | 'vision'>
): ModelFile[] {
  const files: ModelFile[] = [
    {
      key: 'model',
      fileName: 'model.gguf',
      url: model.url,
      sha256: model.sha256,
      sizeBytes: model.sizeBytes,
    },
  ];
  if (model.vision) {
    files.push({
      key: 'mmproj',
      fileName: 'mmproj.gguf',
      ...model.vision.mmproj,
    });
  }
  return files;
}

/** Download size of a model, projector included. */
export function totalBytes(
  model: Pick<CatalogModel, 'sizeBytes' | 'vision'>
): number {
  return model.sizeBytes + (model.vision?.mmproj.sizeBytes ?? 0);
}
