import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, TextInput } from 'react-native';

import { ProgressButton, Text, View } from '@/components/ui';
import type { GenerateResult } from '@/features/llm/engine';
import { findCatalogModel, getCatalogModels } from '@/features/models/catalog';
import { getModels, isMockEngine, llm, useLlm } from '@/features/services';
import { useThemeColors } from '@/lib/hooks/use-theme-colors';

/** Hidden playground for the engine: load a GGUF, stream an answer, stop, unload. */
export default function EngineDevScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const status = useLlm((s) => s.status);
  const progress = useLlm((s) => s.loadProgress);
  const loadedModelId = useLlm((s) => s.loadedModelId);
  const paths = getModels().store.getState().paths;
  const firstId = Object.keys(paths)[0] ?? '';
  const [modelId, setModelId] = useState(firstId);
  const [path, setPath] = useState(paths[firstId] ?? '');
  const [prompt, setPrompt] = useState(
    'Giới thiệu ngắn về Hà Nội trong ba câu.'
  );
  const [output, setOutput] = useState('');
  const [log, setLog] = useState<string[]>([]);

  if (!__DEV__) return <Redirect href="/" />;

  const note = (line: string) =>
    setLog((lines) => [line, ...lines].slice(0, 20));

  const load = async () => {
    const started = Date.now();
    const model = findCatalogModel(modelId);
    try {
      await llm.ensureLoaded({
        id: modelId || path,
        path,
        contextTokens: model?.contextTokens ?? 2048,
        disableThinking: model?.thinking,
      });
      note(`loaded in ${Date.now() - started} ms`);
    } catch (error) {
      note(`load failed: ${String(error)}`);
    }
  };

  const send = async () => {
    setOutput('');
    const result: GenerateResult = await llm.generate(
      [{ role: 'user', content: prompt }],
      {
        temperature: 0.8,
        topP: 0.9,
        minP: 0,
        repeatPenalty: 1.05,
        maxTokens: 256,
      },
      (token) => setOutput((text) => text + token)
    );
    note(
      `ttft ${result.ttftMs ?? '–'} ms · ${result.tokensPerSecond?.toFixed(1) ?? '–'} tok/s · ` +
        `${result.tokens} tokens${result.stopped ? ' · stopped' : ''}`
    );
  };

  const stop = async () => {
    const asked = Date.now();
    await llm.stop();
    note(`stop() returned after ${Date.now() - asked} ms`);
  };

  /** Cosine of a close and a distant Vietnamese pair, to sanity-check embeddings. */
  const embedTest = async () => {
    const model = getCatalogModels().find((m) => m.kind === 'embedding');
    const modelPath = model && paths[model.id];
    if (!model?.embedding || !modelPath) {
      note('embedding model not downloaded');
      return;
    }
    const { queryPrefix, documentPrefix } = model.embedding;
    const started = Date.now();
    const [query, near, far] = await llm.embed(
      { id: model.id, path: modelPath, contextTokens: model.contextTokens },
      [
        `${queryPrefix}Lượng tử hoá giúp model nhẹ hơn thế nào?`,
        `${documentPrefix}Giảm số bit cho mỗi trọng số làm file model nhỏ đi.`,
        `${documentPrefix}Hôm nay trời Hà Nội mưa to, nhớ mang ô.`,
      ]
    );
    const dot = (a: number[], b: number[]) =>
      a.reduce((sum, v, i) => sum + v * b[i], 0);
    note(
      `embed ${query.length}d in ${Date.now() - started} ms · near ${dot(query, near).toFixed(3)} · far ${dot(query, far).toFixed(3)}`
    );
  };

  return (
    <>
      <Stack.Screen options={{ title: t('dev.engine_title') }} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-3 p-4"
      >
        <Text className="text-[13px] text-muted">
          {isMockEngine ? 'MockEngine' : 'LlamaRnEngine'} · {status} ·{' '}
          {loadedModelId ?? 'none'}
          {status === 'loading' ? ` · ${Math.round(progress * 100)}%` : ''}
        </Text>
        <TextInput
          value={modelId}
          onChangeText={(id) => {
            setModelId(id);
            if (paths[id]) setPath(paths[id]);
          }}
          placeholder="catalog id"
          placeholderTextColor={colors.muted}
          className="rounded-xl bg-surface p-3 text-foreground"
        />
        <TextInput
          value={path}
          onChangeText={setPath}
          placeholder="/path/to/model.gguf"
          placeholderTextColor={colors.muted}
          className="rounded-xl bg-surface p-3 text-foreground"
        />
        <View className="flex-row gap-2">
          <ProgressButton
            label="Load"
            onPress={() => void load()}
            className="flex-1"
          />
          <ProgressButton
            label="Unload"
            onPress={() => void llm.unload()}
            className="flex-1"
          />
        </View>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          multiline
          className="min-h-20 rounded-xl bg-surface p-3 text-foreground"
        />
        <View className="flex-row gap-2">
          <ProgressButton
            label="Send"
            onPress={() => void send()}
            className="flex-1"
          />
          <ProgressButton
            label="Stop"
            onPress={() => void stop()}
            className="flex-1"
          />
        </View>
        <ProgressButton label="Embed test" onPress={() => void embedTest()} />
        <Text selectable className="text-[17px] leading-[25px] text-foreground">
          {output}
        </Text>
        {log.map((line, index) => (
          <Text key={index} className="font-mono text-[12px] text-muted">
            {line}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}
