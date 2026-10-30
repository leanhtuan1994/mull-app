import { Drawer } from 'expo-router/drawer';

import { DrawerContent } from '@/components/drawer/drawer-content';
import { useAccessibilitySettings } from '@/lib/hooks/use-accessibility-settings';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

const DRAWER_WIDTH = 310;

export default function DrawerLayout() {
  const colors = useThemeColors();
  const { reduceMotion } = useAccessibilitySettings();

  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        headerShown: false,
        // Slide pushes the chat aside and lets DrawerScene shrink it; under
        // Reduce Motion the sidebar fades in over the content instead.
        drawerType: reduceMotion ? 'front' : 'slide',
        overlayColor: reduceMotion ? 'rgba(0,0,0,0.25)' : 'transparent',
        drawerStyle: { width: DRAWER_WIDTH, backgroundColor: colors.drawer },
        sceneStyle: { backgroundColor: colors.drawer },
        swipeEnabled: true,
        swipeEdgeWidth: 40,
      }}
    >
      <Drawer.Screen name="index" />
      <Drawer.Screen name="chat/[id]" />
      <Drawer.Screen name="models" />
      <Drawer.Screen name="settings" />
    </Drawer>
  );
}
