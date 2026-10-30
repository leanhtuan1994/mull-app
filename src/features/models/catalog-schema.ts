import { z } from 'zod';

export const MODEL_LABELS = [
  'smallest',
  'small',
  'fastest',
  'fast',
  'balanced',
  'best_quality',
  'multilingual',
  'vietnamese',
  'reasoning',
  'coding',
] as const;

export const MODEL_FAMILIES = [
  'qwen',
  'llama',
  'gemma',
  'smollm',
  'phi',
] as const;

const samplingSchema = z.object({
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  minP: z.number().min(0).max(1),
  repeatPenalty: z.number().min(0.5).max(2),
});

export const catalogModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  name: z.string().min(1),
  family: z.enum(MODEL_FAMILIES),
  publisher: z.string().min(1),
  license: z.string().min(1),
  params: z.number().positive(),
  quant: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  url: z
    .string()
    .url()
    .refine((u) => u.startsWith('https://') && u.endsWith('.gguf'), {
      message: 'Model URLs must be https and point at a .gguf file',
    }),
  sourceUrl: z.string().url(),
  contextTokens: z.number().int().min(512),
  /** Qwen3-style models that think before answering unless told not to. */
  thinking: z.boolean(),
  defaultSampling: samplingSchema,
  systemPrompt: z.string().optional(),
  labels: z.array(z.enum(MODEL_LABELS)),
  /** Shown on the model detail screen, in the app's language. */
  description: z.object({ vi: z.string().min(1), en: z.string().min(1) }),
  minRamGB: z.number().positive().optional(),
  /** Small enough to iterate with on the iOS Simulator's CPU. */
  simulatorFriendly: z.boolean(),
});

export const catalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    catalogVersion: z.number().int().positive(),
    models: z.array(catalogModelSchema).min(1),
  })
  .superRefine((catalog, ctx) => {
    const seen = new Set<string>();
    for (const model of catalog.models) {
      if (seen.has(model.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate model id: ${model.id}`,
        });
      }
      seen.add(model.id);
    }
  });

export type CatalogModel = z.infer<typeof catalogModelSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type ModelLabel = (typeof MODEL_LABELS)[number];
export type ModelFamily = (typeof MODEL_FAMILIES)[number];
export type ModelSampling = z.infer<typeof samplingSchema>;
