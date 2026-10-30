import {
  BUILT_IN_PRESETS,
  PRESET_CONTENT_MAX,
  PRESET_NAME_MAX,
} from './built-in-presets';
import { validatePreset } from './preset-schema';

describe('validatePreset', () => {
  it('accepts and trims a valid preset', () => {
    expect(
      validatePreset({ name: '  Email  ', content: ' Viết email ' })
    ).toEqual({
      data: { name: 'Email', content: 'Viết email' },
      errors: {},
    });
  });

  it('requires a name and content', () => {
    expect(validatePreset({ name: ' ', content: '' }).errors).toEqual({
      name: 'name_required',
      content: 'content_required',
    });
  });

  it('caps the name at 40 and the content at 2000 characters', () => {
    const { errors } = validatePreset({
      name: 'x'.repeat(PRESET_NAME_MAX + 1),
      content: 'y'.repeat(PRESET_CONTENT_MAX + 1),
    });
    expect(errors).toEqual({
      name: 'name_too_long',
      content: 'content_too_long',
    });
    expect(
      validatePreset({
        name: 'x'.repeat(PRESET_NAME_MAX),
        content: 'y'.repeat(PRESET_CONTENT_MAX),
      }).data
    ).not.toBeNull();
  });

  it('ships three valid built-ins with one default', () => {
    expect(BUILT_IN_PRESETS).toHaveLength(3);
    expect(BUILT_IN_PRESETS.filter((p) => p.isDefault)).toHaveLength(1);
    for (const preset of BUILT_IN_PRESETS)
      expect(validatePreset(preset).data).not.toBeNull();
  });
});
