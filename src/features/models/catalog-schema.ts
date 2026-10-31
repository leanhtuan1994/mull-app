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
  'vision',
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

const ggufUrl = z
  .string()
  .url()
  .refine((u) => u.startsWith('https://') && u.endsWith('.gguf'), {
    message: 'Model URLs must be https and point at a .gguf file',
  });

const fileSchema = z.object({
  url: ggufUrl,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  sizeBytes: z.number().int().positive(),
});

export const catalogModelSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/),
  /** Chat models answer; embedding models only index documents. */
  kind: z.enum(['chat', 'embedding']).default('chat'),
  name: z.string().min(1),
  family: z.enum(MODEL_FAMILIES),
  publisher: z.string().min(1),
  license: z.string().min(1),
  params: z.number().positive(),
  quant: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  url: ggufUrl,
  sourceUrl: z.string().url(),
  contextTokens: z.number().int().min(512),
  /**
   * f16 KV cache per token of context: layers × KV heads × head size × 2 × 2
   * bytes. Counted in the RAM budget, since at 8192 tokens it can rival the
   * weights.
   */
  kvBytesPerToken: z.number().int().positive(),
  /** A vision projector loaded next to the weights, so the model reads images. */
  vision: z
    .object({
      mmproj: fileSchema,
      /** Caps the tokens one image costs; llama.cpp downscales to fit. */
      imageMaxTokens: z.number().int().positive(),
    })
    .optional(),
  embedding: z
    .object({
      dimensions: z.number().int().positive(),
      /** Prepended to a search query, as the model was trained. */
      queryPrefix: z.string(),
      /** Prepended to a document passage. */
      documentPrefix: z.string(),
    })
    .optional(),
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
      if ((model.kind === 'embedding') !== (model.embedding !== undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${model.id}: embedding settings belong to embedding models only`,
        });
      }
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
