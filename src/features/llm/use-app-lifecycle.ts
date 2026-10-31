import { useEffect } from 'react';
import { AppState } from 'react-native';

import { chat, ingest, llm } from '@/features/services';

/** Release the model after this long in the background; reload lazily on return. */
export const BACKGROUND_UNLOAD_MS = 60_000;

/**
 * Going to the background stops an answer (saving what was written) and
 * frees the model after a minute. Memory warnings release it at once.
 */
export function useAppLifecycle() {
  useEffect(() => {
    let unloadTimer: ReturnType<typeof setTimeout> | null = null;
    let backgroundSince: number | null = null;

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        backgroundSince ??= Date.now();
        void chat.stop();
        // iOS does not allow GPU work in the background.
        ingest.pause();
        unloadTimer ??= setTimeout(() => {
          unloadTimer = null;
          void llm.unload();
        }, BACKGROUND_UNLOAD_MS);
      } else if (state === 'active') {
        if (unloadTimer) clearTimeout(unloadTimer);
        unloadTimer = null;
        void ingest.resume();
        // iOS suspends JS timers in the background, so check the clock too.
        if (
          backgroundSince &&
          Date.now() - backgroundSince >= BACKGROUND_UNLOAD_MS
        ) {
          void llm.unload();
        }
        backgroundSince = null;
      }
    });
    const memory = AppState.addEventListener('memoryWarning', () => {
      void llm.handleMemoryWarning();
    });

    return () => {
      appState.remove();
      memory.remove();
      if (unloadTimer) clearTimeout(unloadTimer);
    };
  }, []);
}
