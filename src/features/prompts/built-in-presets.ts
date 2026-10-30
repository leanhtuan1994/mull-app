import type { BuiltInPreset } from '@/db/repos';

export const PRESET_NAME_MAX = 40;
export const PRESET_CONTENT_MAX = 2000;

/** Shipped presets. Users can edit and reset them, but not delete them. */
export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  {
    key: 'helpful',
    name: 'Trợ lý hữu ích',
    content:
      'Bạn là trợ lý hữu ích và trung thực. Trả lời bằng tiếng Việt, rõ ràng, và nói thẳng khi bạn không chắc chắn.',
    isDefault: true,
  },
  {
    key: 'concise',
    name: 'Ngắn gọn',
    content:
      'Trả lời trong tối đa ba câu. Bỏ qua phần mở đầu, đi thẳng vào ý chính.',
  },
  {
    key: 'english-tutor',
    name: 'Gia sư tiếng Anh',
    content:
      'Bạn là gia sư tiếng Anh. Giải thích ngữ pháp tiếng Anh thật đơn giản bằng tiếng Việt, kèm một câu ví dụ cho mỗi ý.',
  },
];
