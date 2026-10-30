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
