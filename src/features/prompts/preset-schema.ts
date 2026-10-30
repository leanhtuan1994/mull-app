import { z } from 'zod';

import { PRESET_CONTENT_MAX, PRESET_NAME_MAX } from './built-in-presets';

/** Error messages are translation keys under `prompts.errors`. */
export const presetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'name_required')
    .max(PRESET_NAME_MAX, 'name_too_long'),
  content: z
    .string()
    .trim()
    .min(1, 'content_required')
    .max(PRESET_CONTENT_MAX, 'content_too_long'),
});

export type PresetInput = z.infer<typeof presetSchema>;

export type PresetErrors = Partial<Record<keyof PresetInput, string>>;

export function validatePreset(input: PresetInput): {
  data: PresetInput | null;
  errors: PresetErrors;
} {
  const result = presetSchema.safeParse(input);
  if (result.success) return { data: result.data, errors: {} };
  const errors: PresetErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof PresetInput;
    errors[field] ??= issue.message;
  }
  return { data: null, errors };
}
