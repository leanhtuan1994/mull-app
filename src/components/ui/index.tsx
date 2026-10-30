import { SafeAreaView } from 'react-native-safe-area-context';
import Svg from 'react-native-svg';
import { withUniwind } from 'uniwind';

export * from './glass-icon-button';
export * from './icon';
export * from './large-title';
export * from './list';
export * from './list-section';
export * from './model-monogram';
export * from './progress-button';
export * from './progress-ring';
export * from './screen-header';
export * from './segmented-control';
export * from './text';
export * from './utils';

// export base components from react-native
export {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';

export const StyledSafeAreaView = withUniwind(SafeAreaView);
export const StyledSvg = withUniwind(Svg);
