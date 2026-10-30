import { getCatalogModels, loadCatalog } from './catalog';
import bundledCatalog from './catalog.json';
import { catalogSchema } from './catalog-schema';

describe('model catalog', () => {
  it('parses against the schema', () => {
    expect(() => loadCatalog()).not.toThrow();
    expect(loadCatalog().schemaVersion).toBe(1);
  });

  it('has unique ids and gguf urls pinned to a commit', () => {
    const models = getCatalogModels();
    expect(new Set(models.map((m) => m.id)).size).toBe(models.length);
    for (const model of models) {
      expect(model.url).toMatch(
        /^https:\/\/huggingface\.co\/.+\/resolve\/[0-9a-f]{40}\/.+\.gguf$/
      );
    }
  });

  it('offers at least one model small enough for the simulator', () => {
    const small = getCatalogModels().filter((m) => m.simulatorFriendly);
    expect(small.length).toBeGreaterThan(0);
    for (const model of small) expect(model.params).toBeLessThanOrEqual(1.2);
  });

  it('rejects duplicate ids', () => {
    const first = bundledCatalog.models[0];
    const result = catalogSchema.safeParse({
      ...bundledCatalog,
      models: [first, first],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-gguf urls', () => {
    const first = bundledCatalog.models[0];
    const result = catalogSchema.safeParse({
      ...bundledCatalog,
      models: [{ ...first, url: 'https://example.com/model.bin' }],
    });
    expect(result.success).toBe(false);
  });
});
