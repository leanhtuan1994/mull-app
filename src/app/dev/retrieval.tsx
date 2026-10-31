import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { ProgressButton, Text } from '@/components/ui';
import {
  HANDBOOK_QUESTIONS,
  HANDBOOK_SECTIONS,
} from '@/features/attachments/retrieval-fixture';
import { getCatalogModels } from '@/features/models/catalog';
import { getModels, llm } from '@/features/services';

const dot = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + v * b[i], 0);

/** recall@1 and recall@4 of the embedding model on the handbook fixture. */
export default function RetrievalDevScreen() {
  const { t } = useTranslation();
  const [lines, setLines] = useState<string[]>([]);

  const run = async () => {
    const paths = getModels().store.getState().paths;
    const model = getCatalogModels().find(
      (m) => m.kind === 'embedding' && paths[m.id]
    );
    if (!model?.embedding) {
      setLines(['embedding model not downloaded']);
      return;
    }
    const target = {
      id: model.id,
      path: paths[model.id],
      contextTokens: model.contextTokens,
    };
    const started = Date.now();
    const sections = await llm.embed(
      target,
      HANDBOOK_SECTIONS.map((s) => `${model.embedding!.documentPrefix}${s}`)
    );
    const questions = await llm.embed(
      target,
      HANDBOOK_QUESTIONS.map(([q]) => `${model.embedding!.queryPrefix}${q}`)
    );
    let top1 = 0;
    let top4 = 0;
    const misses: string[] = [];
    HANDBOOK_QUESTIONS.forEach(([question, answer], i) => {
      const ranked = sections
        .map((vector, index) => ({ index, score: dot(questions[i], vector) }))
        .sort((a, b) => b.score - a.score)
        .map((r) => r.index);
      if (ranked[0] === answer) top1 += 1;
      if (ranked.slice(0, 4).includes(answer)) top4 += 1;
      else
        misses.push(
          `miss: ${question} → got ${ranked.slice(0, 4).join(',')}, want ${answer}`
        );
    });
    const n = HANDBOOK_QUESTIONS.length;
    setLines([
      `${model.name}: recall@1 ${top1}/${n}, recall@4 ${top4}/${n}`,
      `${Date.now() - started} ms for ${HANDBOOK_SECTIONS.length + n} texts`,
      ...misses,
    ]);
  };

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <>
      <Stack.Screen options={{ title: t('dev.retrieval_title') }} />
      <ScrollView
        className="flex-1 bg-background"
        contentContainerClassName="gap-3 p-4"
        contentInsetAdjustmentBehavior="automatic"
      >
        <ProgressButton label="Run recall@4" onPress={() => void run()} />
        {lines.map((line, i) => (
          <Text
            key={i}
            testID={`retrieval-line-${i}`}
            className="text-[14px] text-foreground"
          >
            {line}
          </Text>
        ))}
      </ScrollView>
    </>
  );
}
