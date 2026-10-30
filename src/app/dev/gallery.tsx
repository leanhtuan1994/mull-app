import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { ThemeSelector } from '@/components/settings/theme-selector';
import {
  GlassIconButton,
  LargeTitle,
  ListRow,
  ListSection,
  ModelMonogram,
  ProgressButton,
  ProgressRing,
  SegmentedControl,
  Text,
  View,
} from '@/components/ui';
import { MODEL_FAMILIES } from '@/features/models/catalog-schema';

/** Every shared primitive in one place, to compare with the prototype in light and dark. */
export default function GalleryDevScreen() {
  const { t } = useTranslation();
  const [segment, setSegment] = useState<'a' | 'b' | 'c'>('b');
  const [progress, setProgress] = useState(0.42);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen options={{ title: t('dev.gallery_title') }} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-6 p-4"
      >
        <LargeTitle>Tiêu đề lớn ỗ ể ặ</LargeTitle>
        <ThemeSelector />
        <View className="flex-row gap-3">
          <GlassIconButton
            icon="menu"
            accessibilityLabel="Menu"
            onPress={() => {}}
          />
          <GlassIconButton
            icon="create-outline"
            accessibilityLabel="Mới"
            onPress={() => {}}
          />
        </View>
        <View className="flex-row gap-3">
          {MODEL_FAMILIES.map((family) => (
            <ModelMonogram key={family} name={family} family={family} />
          ))}
        </View>
        <ListSection title="Nhóm" footer="Chú thích dưới nhóm.">
          <ListRow title="Có giá trị" value="Llama 3.2 3B" onPress={() => {}} />
          <ListRow title="Màu nhấn" accent onPress={() => {}} />
          <ListRow title="Xoá" destructive chevron={false} onPress={() => {}} />
        </ListSection>
        <SegmentedControl
          accessibilityLabel="Demo"
          value={segment}
          onChange={setSegment}
          options={[
            { value: 'a', label: 'Ngắn' },
            { value: 'b', label: 'Vừa' },
            { value: 'c', label: 'Dài' },
          ]}
        />
        <View className="flex-row items-center gap-4">
          <ProgressRing fraction={progress} />
          <ProgressRing fraction={progress} size={44} strokeWidth={4} />
          <Text className="text-foreground">{Math.round(progress * 100)}%</Text>
        </View>
        <ProgressButton
          label="Tải về · 2,5 GB"
          icon="cloud-download-outline"
          onPress={() => setProgress(0)}
        />
        <ProgressButton
          label={`Đang tải ${Math.round(progress * 100)}% · Chạm để huỷ`}
          progress={progress}
          onPress={() =>
            setProgress((p) => (p >= 1 ? 0 : Math.min(1, p + 0.1)))
          }
        />
        <ProgressButton label="Đang kiểm tra file…" busy onPress={() => {}} />
      </ScrollView>
    </>
  );
}
