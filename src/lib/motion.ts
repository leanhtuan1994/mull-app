import type { WithSpringConfig } from 'react-native-reanimated';

/** Default UI spring: critically damped, about 0.35 s. */
export const SPRING_DEFAULT: WithSpringConfig = {
  dampingRatio: 1,
  duration: 350,
};

/** Drawer and sheet spring: a touch of bounce, about 0.3 s. */
export const SPRING_DRAWER: WithSpringConfig = {
  dampingRatio: 0.85,
  duration: 300,
};

/** Press-down feedback that starts on touch, not on release. */
export const PRESS_SCALE = 0.94;
