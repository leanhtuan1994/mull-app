import { Stack } from 'expo-router';

import { DrawerScene } from '@/components/drawer/drawer-scene';

export default function SettingsLayout() {
  return (
    <DrawerScene>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="storage" />
        <Stack.Screen name="prompts" />
      </Stack>
    </DrawerScene>
  );
}
