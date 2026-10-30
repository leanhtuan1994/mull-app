import type { CatalogModel } from './catalog-schema';

const GB = 1024 ** 3;

/**
 * The RAM size Apple markets. iOS reports a little less than that (an 8 GB
 * iPhone reports about 7.4 GiB), so round up.
 */
export function deviceRamGB(totalRamBytes: number): number {
  return Math.max(1, Math.ceil(totalRamBytes / GB - 0.1));
}

/** iOS lets an app use roughly 60% of RAM before jetsam; keep 5% and 0.5 GB spare. */
export function memoryBudgetGB(totalRamBytes: number): number {
  const ramGB = totalRamBytes / GB;
  return Math.max(0, ramGB * 0.6 * 0.95 - 0.5);
}

/** Weights plus about 0.3 GB for the KV cache and runtime buffers. */
export function modelCostGB(model: Pick<CatalogModel, 'sizeBytes'>): number {
  return model.sizeBytes / GB + 0.3;
}

/** The smallest whole number of GB of RAM on which the model fits the budget. */
export function minimumRamGB(
  model: Pick<CatalogModel, 'sizeBytes' | 'minRamGB'>
) {
  if (model.minRamGB) return model.minRamGB;
  // Invert the budget formula, then round up to the next GB.
  return Math.ceil((modelCostGB(model) + 0.5) / (0.6 * 0.95));
}

export function fitsDevice(
  model: Pick<CatalogModel, 'sizeBytes' | 'minRamGB'>,
  totalRamBytes: number
): boolean {
  if (model.minRamGB) return deviceRamGB(totalRamBytes) >= model.minRamGB;
  return modelCostGB(model) <= memoryBudgetGB(totalRamBytes);
}

/**
 * The model to badge as recommended: the largest one that still leaves at
 * least 15% of the budget free.
 */
export function recommendedModel<
  T extends Pick<CatalogModel, 'sizeBytes' | 'minRamGB'>,
>(models: T[], totalRamBytes: number): T | undefined {
  const budget = memoryBudgetGB(totalRamBytes);
  return models
    .filter(
      (m) => fitsDevice(m, totalRamBytes) && modelCostGB(m) <= budget * 0.85
    )
    .sort((a, b) => b.sizeBytes - a.sizeBytes)[0];
}

/** Up to `count` models for onboarding: the recommended one first, then the next largest that fit. */
export function onboardingChoices<
  T extends Pick<CatalogModel, 'id' | 'sizeBytes' | 'minRamGB'>,
>(
  models: T[],
  totalRamBytes: number,
  count = 3
): { models: T[]; recommendedId: string | undefined } {
  const recommended = recommendedModel(models, totalRamBytes);
  const others = models
    .filter((m) => m.id !== recommended?.id && fitsDevice(m, totalRamBytes))
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
  const picked = (recommended ? [recommended, ...others] : others).slice(
    0,
    count
  );
  return { models: picked, recommendedId: recommended?.id };
}

export type ModelGroups<T> = { onDevice: T[]; runsWell: T[]; needsMore: T[] };

export function groupModels<
  T extends Pick<CatalogModel, 'id' | 'sizeBytes' | 'minRamGB'>,
>(
  models: T[],
  totalRamBytes: number,
  downloadedIds: ReadonlySet<string>
): ModelGroups<T> {
  const groups: ModelGroups<T> = { onDevice: [], runsWell: [], needsMore: [] };
  for (const model of models) {
    if (downloadedIds.has(model.id)) groups.onDevice.push(model);
    else if (fitsDevice(model, totalRamBytes)) groups.runsWell.push(model);
    else groups.needsMore.push(model);
  }
  return groups;
}
