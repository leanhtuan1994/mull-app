import type { ConfigContext } from '@expo/config';

import createConfig from './app.config';

describe('app config', () => {
  const config = createConfig({ config: {} } as ConfigContext);

  it('identifies the app as Mull on iPhone only', () => {
    expect(config.name).toBe('Mull');
    expect(config.slug).toBe('mull');
    expect(config.scheme).toBe('mull');
    expect(config.ios?.supportsTablet).toBe(false);
  });

  it('uses the unbadged source icon', () => {
    expect(config.icon).toBe('./assets/icon.png');
  });
});
