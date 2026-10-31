import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

export type PickedFile = { uri: string; name: string; mime: string };

export type PickSource = 'library' | 'camera' | 'document';

/**
 * Types Mull can read from Files: PDF with a text layer, plain text and
 * Markdown, and images, which many people keep in Files rather than Photos.
 */
const DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'image/*',
];

/**
 * Lets the person choose up to `limit` files. Returns nothing when they
 * cancel or deny camera access.
 */
export async function pickFiles(
  source: PickSource,
  limit: number
): Promise<PickedFile[]> {
  if (limit <= 0) return [];
  if (source === 'document') {
    const result = await DocumentPicker.getDocumentAsync({
      type: DOCUMENT_TYPES,
      multiple: limit > 1,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return [];
    return result.assets.slice(0, limit).map((asset) => ({
      uri: asset.uri,
      name: asset.name,
      mime: asset.mimeType ?? guessMime(asset.name),
    }));
  }

  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return [];
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset, index) => ({
    uri: asset.uri,
    name: asset.fileName ?? `anh-${index + 1}.jpg`,
    mime: asset.mimeType ?? 'image/jpeg',
  }));
}

function guessMime(name: string) {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.(jpe?g|png|heic|heif|gif|webp)$/i.test(name)) return 'image/jpeg';
  if (/\.(md|markdown)$/i.test(name)) return 'text/markdown';
  return 'text/plain';
}
