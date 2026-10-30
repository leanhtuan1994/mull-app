import { storage } from '@/lib/storage';

import {
  clampTemperature,
  DEFAULT_SETTINGS,
  useSettings,
} from './settings-store';

describe('settings store', () => {
  beforeEach(() => useSettings.setState(DEFAULT_SETTINGS));

  it('defaults to temperature 0.8, medium answers and no cellular downloads', () => {
    expect(useSettings.getState()).toMatchObject({
      onboardingDone: false,
      temperature: 0.8,
      responseLength: 'medium',
      allowCellular: false,
    });
  });

  it('persists changes to MMKV', () => {
    useSettings
      .getState()
      .update({ onboardingDone: true, defaultModelId: 'qwen3-0.6b-q4km' });
    const saved = JSON.parse(storage.getString('mull-settings') ?? '{}');
    expect(saved.state).toMatchObject({
      onboardingDone: true,
      defaultModelId: 'qwen3-0.6b-q4km',
    });
    expect(saved.state.update).toBeUndefined();
  });

  it('snaps temperature to 0.1 steps within 0–1.5', () => {
    expect(clampTemperature(0.84)).toBe(0.8);
    expect(clampTemperature(2)).toBe(1.5);
    expect(clampTemperature(-1)).toBe(0);
    useSettings.getState().setTemperature(1.26);
    expect(useSettings.getState().temperature).toBe(1.3);
  });
});
