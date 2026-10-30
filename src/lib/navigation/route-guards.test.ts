import { getRouteGuards } from './route-guards';

describe('getRouteGuards', () => {
  it('shows onboarding until it is done', () => {
    expect(getRouteGuards({ needsOnboarding: true })).toEqual({
      canSeeOnboarding: true,
      canSeeApp: false,
      redirectTo: '/onboarding',
    });
  });
  it('shows the app after onboarding', () => {
    expect(getRouteGuards({ needsOnboarding: false })).toEqual({
      canSeeOnboarding: false,
      canSeeApp: true,
      redirectTo: '/',
    });
  });
});
