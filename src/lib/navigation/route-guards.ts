import type { Href } from 'expo-router';

type RouteGuardInput = { needsOnboarding: boolean };

export type RouteGuards = {
  canSeeOnboarding: boolean;
  canSeeApp: boolean;
  // Where a guarded route sends the user. Expo Router otherwise falls back to
  // the first unguarded route in file order, which is not a screen here.
  redirectTo: Href;
};

export function getRouteGuards({
  needsOnboarding,
}: RouteGuardInput): RouteGuards {
  return {
    canSeeOnboarding: needsOnboarding,
    canSeeApp: !needsOnboarding,
    redirectTo: needsOnboarding ? '/onboarding' : '/',
  };
}
