import type { ConfigContext, ExpoConfig } from '@expo/config';

import { ClientEnv, Env } from './env';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: Env.NAME,
  description: `${Env.NAME} — trò chuyện với mô hình ngôn ngữ chạy ngay trên iPhone`,
  owner: Env.EXPO_ACCOUNT_OWNER,
  scheme: Env.SCHEME,
  slug: 'mull',
  version: Env.VERSION.toString(),
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  updates: { fallbackToCacheTimeout: 0 },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: Env.BUNDLE_ID,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  experiments: { typedRoutes: true, reactCompiler: true },
  // Mull ships on iPhone only. This minimal block keeps `expo prebuild` valid.
  android: {
    package: Env.PACKAGE,
  },
  plugins: [
    ['expo-build-properties', { ios: { deploymentTarget: '17.0' } }],
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F5F1EA',
        image: './assets/splash-icon.png',
        imageWidth: 150,
        dark: { backgroundColor: '#171513' },
      },
    ],
    'expo-localization',
    'expo-router',
    // Adds the increased-memory-limit and extended-virtual-addressing
    // entitlements on EAS builds. Local simulator builds are unsigned, so
    // they skip them.
    [
      'llama.rn',
      {
        enableEntitlements: true,
        entitlementsProfile: ['production', 'staging', 'development'],
        enableOpenCLAndHexagon: false,
      },
    ],
    // Wires handleEventsForBackgroundURLSession into the AppDelegate so model
    // downloads keep running while Mull is in the background.
    '@kesha-antonov/react-native-background-downloader',
    ['expo-sqlite', { enableFTS: true }],
    ['expo-image'],
    [
      'expo-image-picker',
      {
        photosPermission:
          'Mull mở ảnh bạn chọn để model đọc ảnh ngay trên iPhone. Ảnh không rời khỏi máy.',
        cameraPermission:
          'Mull dùng camera để bạn chụp ảnh gửi cho model đọc ngay trên iPhone. Ảnh không rời khỏi máy.',
        microphonePermission: false,
      },
    ],
    'expo-document-picker',
    'expo-status-bar',
  ],
  extra: {
    ...ClientEnv,
    ...(Env.EAS_PROJECT_ID ? { eas: { projectId: Env.EAS_PROJECT_ID } } : {}),
  },
});
