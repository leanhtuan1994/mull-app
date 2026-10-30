import { create } from 'zustand';

/** Bumped whenever chats are created, renamed, deleted or used, so lists reload. */
export const useChatListVersion = create<{ version: number }>(() => ({
  version: 0,
}));

export function notifyChatsChanged() {
  useChatListVersion.setState((state) => ({ version: state.version + 1 }));
}
