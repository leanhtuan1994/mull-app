import { createStore } from 'zustand/vanilla';

import type { Repos } from '@/db/repos';
import { titleFromMessage } from '@/db/repos';
import type { ChatRow, MessageRow } from '@/db/types';
import type { ChatMessage, GenerateResult } from '@/features/llm/engine';
import type { LlmController } from '@/features/llm/llm-store';
import type { CatalogModel } from '@/features/models/catalog-schema';

import {
  buildPrompt,
  RESPONSE_LENGTH_TOKENS,
  type ResponseLength,
} from './context-budget';

export type UiMessage = Pick<
  MessageRow,
  | 'id'
  | 'role'
  | 'content'
  | 'modelName'
  | 'tokensPerSecond'
  | 'tokenCount'
  | 'error'
> & { stoppedByUser: boolean };

export type ChatError = 'noModel' | 'load' | 'generate';

export type ChatState = {
  chat: ChatRow | null;
  messages: UiMessage[];
  /** The answer being written, flushed once per frame. */
  streaming: {
    text: string;
    modelName: string;
    replacesId: number | null;
  } | null;
  /** Older messages were left out of the last prompt. */
  trimmed: boolean;
  /** Model for the next answer: the chat's, or the pick on the new-chat screen. */
  modelId: string | null;
  error: ChatError | null;
};

export type ChatDeps = {
  repos: () => Repos;
  llm: LlmController;
  findModel: (id: string | null) => CatalogModel | undefined;
  modelPath: (id: string) => string | undefined;
  settings: () => {
    temperature: number;
    responseLength: ResponseLength;
    defaultModelId: string | null;
  };
  /** requestAnimationFrame in the app; tests flush synchronously. */
  scheduleFrame?: (callback: () => void) => void;
  /** Called after a chat is created or gets a new message, so lists can refresh. */
  onChatsChanged?: () => void;
};

export function toUiMessage(row: MessageRow): UiMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    modelName: row.modelName,
    tokensPerSecond: row.tokensPerSecond,
    tokenCount: row.tokenCount,
    error: row.error,
    stoppedByUser: row.stoppedByUser === 1,
  };
}

export function createChatStore(deps: ChatDeps) {
  const schedule = deps.scheduleFrame ?? ((callback: () => void) => callback());
  const store = createStore<ChatState>()(() => ({
    chat: null,
    messages: [],
    streaming: null,
    trimmed: false,
    modelId: null,
    error: null,
  }));
  const set = (patch: Partial<ChatState>) => store.setState(patch);
  let openSeq = 0;

  function loadable(model: CatalogModel) {
    const path = deps.modelPath(model.id);
    if (!path) return null;
    return {
      id: model.id,
      path,
      contextTokens: model.contextTokens,
      disableThinking: model.thinking,
    };
  }

  /** The model the next answer uses; falls back to the default when the chat's model was deleted. */
  function currentModel(): CatalogModel | undefined {
    for (const id of [
      store.getState().modelId,
      deps.settings().defaultModelId,
    ]) {
      const model = deps.findModel(id);
      if (model && deps.modelPath(model.id)) return model;
    }
    return undefined;
  }

  async function ensureModel(): Promise<CatalogModel | null> {
    const model = currentModel();
    const target = model && loadable(model);
    if (!model || !target) {
      set({ error: 'noModel' });
      return null;
    }
    try {
      await deps.llm.ensureLoaded(target);
      return model;
    } catch {
      set({ error: 'load' });
      return null;
    }
  }

  type AnswerTarget = {
    model: CatalogModel;
    chat: ChatRow;
    /** `openSeq` when the request started; the UI only follows the chat on screen. */
    seq: number;
    replacesId: number | null;
  };

  const onScreen = (seq: number) => seq === openSeq;

  /** Streams one answer for `history`, then saves it in one write. */
  async function answer(
    { model, chat, seq, replacesId }: AnswerTarget,
    history: ChatMessage[]
  ): Promise<void> {
    const settings = deps.settings();
    const maxNewTokens = RESPONSE_LENGTH_TOKENS[settings.responseLength];
    const prompt = buildPrompt({
      modelSystemPrompt: model.systemPrompt,
      chatSystemPrompt: chat.systemPrompt,
      history,
      contextTokens: model.contextTokens,
      maxNewTokens,
    });

    let buffer = '';
    let framePending = false;
    set({
      trimmed: prompt.trimmed,
      streaming: { text: '', modelName: model.name, replacesId },
    });
    const flush = () => {
      framePending = false;
      const streaming = store.getState().streaming;
      if (streaming && onScreen(seq)) {
        set({ streaming: { ...streaming, text: buffer } });
      }
    };

    let result: GenerateResult;
    try {
      result = await deps.llm.generate(
        prompt.messages,
        {
          temperature: settings.temperature,
          topP: model.defaultSampling.topP,
          minP: model.defaultSampling.minP,
          repeatPenalty: model.defaultSampling.repeatPenalty,
          maxTokens: maxNewTokens,
        },
        (token) => {
          buffer += token;
          if (!framePending) {
            framePending = true;
            schedule(flush);
          }
        }
      );
    } catch {
      if (onScreen(seq)) set({ streaming: null, error: 'generate' });
      return;
    }

    const repos = deps.repos();
    const text = (result.text || buffer).trim();
    // Stopped before any text: keep the previous answer, save nothing new.
    if (!text && result.stopped) {
      if (onScreen(seq)) set({ streaming: null });
      return;
    }
    const metrics = {
      content: text,
      modelName: model.name,
      tokensPerSecond: result.tokensPerSecond,
      timeToFirstToken: result.ttftMs,
      tokenCount: result.tokens,
      stoppedByUser: result.stopped,
    };
    let id: number;
    try {
      if (replacesId !== null) {
        await repos.messages.complete(replacesId, metrics);
        id = replacesId;
      } else {
        id = await repos.messages.add({
          chatId: chat.id,
          role: 'assistant',
          ...metrics,
        });
      }
      await repos.chats.touch(chat.id);
    } catch {
      // The chat was deleted while answering.
      if (onScreen(seq)) set({ streaming: null });
      return;
    }
    deps.onChatsChanged?.();
    // The user may have moved to another chat while this answer was written.
    if (!onScreen(seq)) return;
    const saved = toUiMessage((await repos.messages.get(id))!);
    const messages = store.getState().messages;
    set({
      streaming: null,
      messages:
        replacesId !== null
          ? messages.map((m) => (m.id === replacesId ? saved : m))
          : [...messages, saved],
    });
  }

  function historyUpTo(messages: UiMessage[]): ChatMessage[] {
    return messages
      .filter((m) => m.content.trim() && !m.error)
      .map((m) => ({ role: m.role, content: m.content }));
  }

  return {
    store,

    /** Shows an empty new chat that will use `modelId` (or the default). */
    startNew(modelId?: string | null) {
      openSeq += 1;
      // Leaving a chat mid-answer stops it; the partial answer is kept.
      void deps.llm.stop();
      const fallback = deps.settings().defaultModelId;
      set({
        chat: null,
        messages: [],
        streaming: null,
        trimmed: false,
        error: null,
        modelId: modelId ?? fallback,
      });
    },

    async open(chatId: number) {
      if (store.getState().chat?.id === chatId) return;
      // Leaving a chat mid-answer stops it; a request still waiting for the
      // model is dropped once the load finishes.
      void deps.llm.stop();
      const seq = ++openSeq;
      const repos = deps.repos();
      const chat = await repos.chats.get(chatId);
      const rows = chat ? await repos.messages.listByChat(chatId) : [];
      if (seq !== openSeq) return;
      set({
        chat,
        messages: rows.map(toUiMessage),
        streaming: null,
        trimmed: false,
        error: null,
        modelId: chat?.modelId ?? deps.settings().defaultModelId,
      });
    },

    /** Loads the model early, for example when the user starts typing. */
    prepare() {
      const model = currentModel();
      const target = model && loadable(model);
      if (target) deps.llm.ensureLoaded(target).catch(() => undefined);
    },

    /** Sends a message. Resolves with the chat id once the answer is saved. */
    async send(text: string): Promise<number | null> {
      const content = text.trim();
      if (!content || store.getState().streaming || deps.llm.isGenerating())
        return null;
      set({ error: null });
      if (!currentModel()) {
        set({ error: 'noModel' });
        return null;
      }
      const repos = deps.repos();
      let chat = store.getState().chat;
      const modelId = store.getState().modelId;
      if (!chat) {
        const preset = await repos.presets.getDefault();
        const id = await repos.chats.create({
          title: titleFromMessage(content),
          modelId,
          systemPrompt: preset?.content ?? '',
        });
        chat = await repos.chats.get(id);
        set({ chat });
        deps.onChatsChanged?.();
      }
      const userId = await repos.messages.add({
        chatId: chat!.id,
        role: 'user',
        content,
      });
      const userMessage = toUiMessage((await repos.messages.get(userId))!);
      const messages = [...store.getState().messages, userMessage];
      set({
        messages,
        streaming: { text: '', modelName: '', replacesId: null },
      });

      const seq = openSeq;
      const model = await ensureModel();
      // Left this chat while the model loaded: the question stays unanswered.
      if (!onScreen(seq)) return chat!.id;
      if (!model) {
        set({ streaming: null });
        return chat!.id;
      }
      if (chat!.modelId !== model.id) {
        await repos.chats.setModel(chat!.id, model.id);
        chat = { ...chat!, modelId: model.id };
        set({ chat, modelId: model.id });
      }
      await answer(
        { model, chat: chat!, seq, replacesId: null },
        historyUpTo(messages)
      );
      return chat!.id;
    },

    /** Writes a new answer in place of the last one. */
    async regenerate() {
      const { messages, streaming, chat } = store.getState();
      if (!chat || streaming || deps.llm.isGenerating()) return;
      const last = messages[messages.length - 1];
      if (!last || last.role !== 'assistant') return;
      const seq = openSeq;
      set({
        error: null,
        streaming: { text: '', modelName: '', replacesId: last.id },
      });
      const model = await ensureModel();
      if (!onScreen(seq)) return;
      if (!model) {
        set({ streaming: null });
        return;
      }
      await answer(
        { model, chat, seq, replacesId: last.id },
        historyUpTo(messages.slice(0, -1))
      );
    },

    async stop() {
      await deps.llm.stop();
    },

    /** Uses another downloaded model for this chat from the next answer on. */
    async switchModel(modelId: string) {
      const { chat } = store.getState();
      set({ modelId, error: null });
      if (chat) {
        await deps.repos().chats.setModel(chat.id, modelId);
        set({ chat: { ...chat, modelId } });
      }
      const loaded = deps.llm.store.getState().loadedModelId;
      // Free the old model now; the queue waits for any running answer.
      if (loaded && loaded !== modelId) await deps.llm.unload();
    },

    /** The model the next answer will use, if any is on the device. */
    currentModel,

    clearError() {
      set({ error: null });
      deps.llm.clearError();
    },
  };
}

export type ChatController = ReturnType<typeof createChatStore>;
