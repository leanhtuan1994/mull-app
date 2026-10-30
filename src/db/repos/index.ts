import type { Db } from '../types';
import { createChatRepo } from './chat-repo';
import { createMessageRepo } from './message-repo';
import { createModelRepo } from './model-repo';
import { createPresetRepo } from './preset-repo';

export * from './chat-repo';
export * from './message-repo';
export * from './model-repo';
export * from './preset-repo';

export function createRepos(db: Db) {
  return {
    models: createModelRepo(db),
    chats: createChatRepo(db),
    messages: createMessageRepo(db),
    presets: createPresetRepo(db),
  };
}

export type Repos = ReturnType<typeof createRepos>;
