import { getCatalogModels, getChatModels } from './catalog';
import {
  deviceRamGB,
  fitsDevice,
  groupModels,
  memoryBudgetGB,
  minimumRamGB,
  modelCostGB,
  onboardingChoices,
  recommendedModel,
} from './compatibility';

const GB = 1024 ** 3;
const models = getCatalogModels();
const byId = (id: string) => models.find((m) => m.id === id)!;

describe('memory budget', () => {
  it.each([
    [4, 1.78],
    [6, 2.92],
    [8, 4.06],
  ])('%i GB of RAM gives about %f GB', (ram, budget) => {
    expect(memoryBudgetGB(ram * GB)).toBeCloseTo(budget, 2);
  });

  it('adds the KV cache at full context and 0.3 GB of buffers', () => {
    const model = {
      sizeBytes: 2 * GB,
      contextTokens: 4096,
      kvBytesPerToken: 131072,
    };
    expect(modelCostGB(model)).toBeCloseTo(2.8, 5);
  });

  it('counts the vision projector', () => {
    const model = {
      sizeBytes: 2 * GB,
      contextTokens: 1024,
      kvBytesPerToken: 1024,
      vision: {
        mmproj: {
          url: 'https://x/m.gguf',
          sha256: '0'.repeat(64),
          sizeBytes: GB / 2,
        },
        imageMaxTokens: 512,
      },
    };
    expect(modelCostGB(model)).toBeCloseTo(2 + 0.5 + 1 / 1024 + 0.3, 5);
  });
});

describe('fitsDevice', () => {
  it('keeps 4 GB iPhones to models of about 1B', () => {
    const fits = models.filter((m) => fitsDevice(m, 4 * GB));
    expect(fits.length).toBeGreaterThan(0);
    for (const m of fits) expect(m.params).toBeLessThanOrEqual(1.7);
  });

  it('does not call the 2.5 GB models a good fit on a 6 GB iPhone', () => {
    expect(fitsDevice(byId('qwen3-4b-instruct-2507-q4km'), 6 * GB)).toBe(false);
    expect(fitsDevice(byId('phi-4-mini-instruct-q4km'), 6 * GB)).toBe(false);
  });

  it('runs every catalog model on an 8 GB iPhone', () => {
    for (const m of models) expect(fitsDevice(m, 8 * GB)).toBe(true);
  });

  it('treats minRamGB as a floor on top of the budget', () => {
    const tiny = {
      sizeBytes: 0.1 * GB,
      contextTokens: 2048,
      kvBytesPerToken: 1,
      minRamGB: 8,
    };
    expect(fitsDevice(tiny, 6 * GB)).toBe(false);
    expect(fitsDevice(tiny, 8 * GB)).toBe(true);
    const huge = { ...tiny, sizeBytes: 6 * GB };
    expect(fitsDevice(huge, 8 * GB)).toBe(false);
  });

  it('rounds the reported RAM up to the marketed size', () => {
    expect(deviceRamGB(7.4 * GB)).toBe(8);
    expect(deviceRamGB(5.6 * GB)).toBe(6);
    expect(deviceRamGB(16 * GB)).toBe(16);
    expect(fitsDevice(byId('qwen3-4b-instruct-2507-q4km'), 7.4 * GB)).toBe(
      true
    );
  });

  it('reports the RAM a model needs', () => {
    expect(minimumRamGB(byId('llama-3.2-3b-instruct-q4km'))).toBe(6);
    expect(minimumRamGB(byId('qwen3-4b-instruct-2507-q4km'))).toBe(8);
  });
});

describe('recommendation', () => {
  it('leaves 15% of the budget free', () => {
    for (const ram of [4, 6, 8]) {
      const pick = recommendedModel(models, ram * GB)!;
      expect(modelCostGB(pick)).toBeLessThanOrEqual(
        memoryBudgetGB(ram * GB) * 0.85
      );
    }
  });

  it('picks larger models on larger iPhones', () => {
    const four = recommendedModel(models, 4 * GB)!;
    const eight = recommendedModel(models, 8 * GB)!;
    expect(eight.sizeBytes).toBeGreaterThan(four.sizeBytes);
  });

  it('offers three onboarding choices with the recommendation first', () => {
    const { models: picks, recommendedId } = onboardingChoices(
      getChatModels(),
      6 * GB
    );
    expect(picks).toHaveLength(3);
    expect(picks[0].id).toBe(recommendedId);
    for (const m of picks) expect(fitsDevice(m, 6 * GB)).toBe(true);
  });
});

describe('groupModels', () => {
  it('splits into on device, runs well and needs more memory', () => {
    const downloaded = new Set(['qwen3-0.6b-q4km']);
    const groups = groupModels(models, 6 * GB, downloaded);
    expect(groups.onDevice.map((m) => m.id)).toEqual(['qwen3-0.6b-q4km']);
    expect(groups.needsMore.map((m) => m.id)).toContain(
      'qwen3-4b-instruct-2507-q4km'
    );
    expect(
      groups.onDevice.length + groups.runsWell.length + groups.needsMore.length
    ).toBe(models.length);
  });
});
