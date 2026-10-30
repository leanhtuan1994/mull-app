import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

type AccessibilitySettings = {
  reduceMotion: boolean;
  reduceTransparency: boolean;
};

const useAccessibilityStore = create<AccessibilitySettings>(() => ({
  reduceMotion: false,
  reduceTransparency: false,
}));

let subscribed = false;

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) =>
    useAccessibilityStore.setState({ reduceMotion })
  );
  AccessibilityInfo.isReduceTransparencyEnabled().then((reduceTransparency) =>
    useAccessibilityStore.setState({ reduceTransparency })
  );
  AccessibilityInfo.addEventListener('reduceMotionChanged', (reduceMotion) =>
    useAccessibilityStore.setState({ reduceMotion })
  );
  AccessibilityInfo.addEventListener(
    'reduceTransparencyChanged',
    (reduceTransparency) =>
      useAccessibilityStore.setState({ reduceTransparency })
  );
}

/** Reduce Motion and Reduce Transparency, shared by every component that reads them. */
export function useAccessibilitySettings(): AccessibilitySettings {
  useEffect(subscribe, []);
  const reduceMotion = useAccessibilityStore((s) => s.reduceMotion);
  const reduceTransparency = useAccessibilityStore((s) => s.reduceTransparency);
  return { reduceMotion, reduceTransparency };
}
