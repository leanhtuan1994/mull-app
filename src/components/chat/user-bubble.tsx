import { memo } from 'react';

import { Text, View } from '@/components/ui';

export const UserBubble = memo(function UserBubble({
  content,
}: {
  content: string;
}) {
  return (
    <View
      testID="user-bubble"
      className="max-w-[80%] self-end bg-bubble px-[15px] py-2.5"
      style={{
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        borderBottomLeftRadius: 22,
        borderBottomRightRadius: 6,
      }}
    >
      <Text selectable className="text-[17px] leading-[25px] text-foreground">
        {content}
      </Text>
    </View>
  );
});
