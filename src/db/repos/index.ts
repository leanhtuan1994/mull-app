import type { Db } from '../types';
import { createAttachmentRepo } from './attachment-repo';
import { createChatRepo } from './chat-repo';
import { createChunkRepo } from './chunk-repo';
import { createMessageRepo } from './message-repo';
import { createModelRepo } from './model-repo';
import { createPresetRepo } from './preset-repo';

export * from './attachment-repo';
export * from './chat-repo';
export * from './chunk-repo';
export * from './message-repo';
export * from './model-repo';
export * from './preset-repo';

export function createRepos(db: Db) {
  return {
    models: createModelRepo(db),
    chats: createChatRepo(db),
    messages: createMessageRepo(db),
    presets: createPresetRepo(db),
    attachments: createAttachmentRepo(db),
    chunks: createChunkRepo(db),
  };
}

export type Repos = ReturnType<typeof createRepos>;
