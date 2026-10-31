import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassIconButton, View } from '@/components/ui';
import { getRepos } from '@/db/client';
import { attachments } from '@/features/services';

/** A sent image, full screen; pinch to zoom. */
export default function ImageViewerScreen() {
  const { t } = useTranslation();
  // An attachment id, never a URL, so this screen only shows local files.
  const { id } = useLocalSearchParams<{ id: string }>();
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    void getRepos()
      .attachments.get(Number(id))
      .then((row) => {
        if (row?.kind === 'image')
          setUri(`file://${attachments.absolute(row.path)}`);
      });
  }, [id]);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-black" testID="image-viewer">
      <ScrollView
        maximumZoomScale={4}
        minimumZoomScale={1}
        centerContent
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={uri ? { uri } : null}
          style={{ width, height }}
          contentFit="contain"
          accessibilityIgnoresInvertColors
        />
      </ScrollView>
      <View
        className="absolute right-4"
        style={{ top: insets.top + 8 }}
        pointerEvents="box-none"
      >
        <GlassIconButton
          icon="close"
          accessibilityLabel={t('common.close')}
          onPress={() => router.back()}
        />
      </View>
    </View>
  );
}
