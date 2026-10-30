import { create } from 'zustand';
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from 'zustand/middleware';

import type { ResponseLength } from '@/features/chat/context-budget';
import { storage } from '@/lib/storage';

export const TEMPERATURE_MIN = 0;
export const TEMPERATURE_MAX = 1.5;
export const TEMPERATURE_STEP = 0.1;
export const DEFAULT_TEMPERATURE = 0.8;

export type Settings = {
  onboardingDone: boolean;
  defaultModelId: string | null;
  temperature: number;
  responseLength: ResponseLength;
  allowCellular: boolean;
};

type SettingsActions = {
  update: (patch: Partial<Settings>) => void;
  setTemperature: (value: number) => void;
};

export const DEFAULT_SETTINGS: Settings = {
  onboardingDone: false,
  defaultModelId: null,
  temperature: DEFAULT_TEMPERATURE,
  responseLength: 'medium',
  allowCellular: false,
};

const mmkvStorage: StateStorage = {
  getItem: (name) => storage.getString(name) ?? null,
  setItem: (name, value) => storage.set(name, value),
  removeItem: (name) => {
    storage.remove(name);
  },
};

/** Rounds to the slider's 0.1 steps and keeps it in range. */
export function clampTemperature(value: number): number {
  const stepped = Math.round(value / TEMPERATURE_STEP) * TEMPERATURE_STEP;
  return Math.min(
    TEMPERATURE_MAX,
    Math.max(TEMPERATURE_MIN, Number(stepped.toFixed(1)))
  );
}

/** Small preferences live in MMKV; chats and presets live in SQLite. */
export const useSettings = create<Settings & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      setTemperature: (value) => set({ temperature: clampTemperature(value) }),
    }),
    {
      name: 'mull-settings',
      version: 1,
      storage: createJSONStorage(() => mmkvStorage),
      partialize: ({ update: _update, setTemperature: _set, ...settings }) =>
        settings,
    }
  )
);

export const getSettings = () => useSettings.getState();
