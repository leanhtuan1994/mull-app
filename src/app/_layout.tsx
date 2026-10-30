// Import  global CSS file
import '../../global.css';
// Initialize i18next before any screen renders. Release builds evaluate
// modules lazily, so relying on a screen to import it leaves raw keys.
import '@/lib/i18n';

import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SplashScreen, Stack } from 'expo-router';
import { HeroUINativeProvider } from 'heroui-native';
import React, { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  configureReanimatedLogger,
  ReanimatedLogLevel,
} from 'react-native-reanimated';
import { SafeAreaListener } from 'react-native-safe-area-context';
import { Uniwind } from 'uniwind';

import { useAppLifecycle } from '@/features/llm/use-app-lifecycle';
import { bootstrap } from '@/features/services';
import { useSettings } from '@/features/settings/settings-store';
import { AppThemeProvider } from '@/lib/contexts/app-theme-context';
import { loadSelectedTheme } from '@/lib/hooks';
import { getRouteGuards } from '@/lib/navigation/route-guards';

export { ErrorBoundary } from 'expo-router';

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

loadSelectedTheme();
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<Error | null>(null);

  useEffect(() => {
    bootstrap()
      .then(() => setReady(true))
      .catch((error: Error) => setBootError(error))
      .finally(() => SplashScreen.hideAsync().catch(() => undefined));
  }, []);

  // Let the root ErrorBoundary show a startup failure instead of a blank screen.
  if (bootError) throw bootError;
  if (!ready) return null;

  return (
    <Providers>
      <AppNavigator />
    </Providers>
  );
}

function AppNavigator() {
  const onboardingDone = useSettings((s) => s.onboardingDone);
  const guards = getRouteGuards({ needsOnboarding: !onboardingDone });
  useAppLifecycle();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected
        guard={guards.canSeeOnboarding}
        redirectTo={guards.redirectTo}
      >
        <Stack.Screen name="onboarding" />
      </Stack.Protected>
      <Stack.Protected guard={guards.canSeeApp} redirectTo={guards.redirectTo}>
        <Stack.Screen name="(drawer)" />
        <Stack.Screen
          name="model/[id]"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.92],
            sheetGrabberVisible: true,
            sheetCornerRadius: 34,
          }}
        />
        <Stack.Screen
          name="model-picker"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.62, 0.92],
            sheetGrabberVisible: true,
            sheetCornerRadius: 34,
          }}
        />
        <Stack.Screen
          name="prompt-edit"
          options={{
            presentation: 'formSheet',
            sheetAllowedDetents: [0.92],
            sheetGrabberVisible: true,
            sheetCornerRadius: 34,
          }}
        />
      </Stack.Protected>
      <Stack.Screen name="dev/engine" options={{ headerShown: true }} />
      <Stack.Screen name="dev/gallery" options={{ headerShown: true }} />
    </Stack>
  );
}

const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const contentWrapper = useCallback(
    (children: React.ReactNode) => (
      <KeyboardAvoidingView
        pointerEvents="box-none"
        behavior="padding"
        keyboardVerticalOffset={12}
        className="flex-1"
      >
        {children}
      </KeyboardAvoidingView>
    ),
    []
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Feeds safe area insets to Uniwind's `*-safe` classes. */}
      <SafeAreaListener onChange={({ insets }) => Uniwind.updateInsets(insets)}>
        <KeyboardProvider>
          <AppThemeProvider>
            <HeroUINativeProvider config={{ toast: { contentWrapper } }}>
              <BottomSheetModalProvider>{children}</BottomSheetModalProvider>
            </HeroUINativeProvider>
          </AppThemeProvider>
        </KeyboardProvider>
      </SafeAreaListener>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
