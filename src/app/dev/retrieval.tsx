import { Redirect, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';

import { ProgressButton, Text } from '@/components/ui';
import type { IndexedChunk } from '@/db/types';
import { searchQuery } from '@/features/attachments/document-context';
import {
  HANDBOOK_FOLLOW_UPS,
  HANDBOOK_QUESTIONS,
  HANDBOOK_SECTIONS,
  HANDBOOK_UNANSWERED,
} from '@/features/attachments/retrieval-fixture';
import { selectSeeds } from '@/features/attachments/retrieve';
import { estimateTokens } from '@/features/chat/token-estimate';
import { getCatalogModels } from '@/features/models/catalog';
import { getModels, llm } from '@/features/services';

const dot = (a: number[], b: number[]) =>
  a.reduce((sum, v, i) => sum + v * b[i], 0);

/**
 * recall@1 and recall@4 of the embedding model on the handbook fixture, and
 * how many passages hybrid retrieval chooses, with each section as one
 * passage, for plain questions and for follow-ups searched with and without
 * the question before them.
 */
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
    const followUps = HANDBOOK_FOLLOW_UPS.map(([previous, question]) => [
      question,
      searchQuery(question, previous),
    ]).flat();
    const questions = await llm.embed(
      target,
      [
        ...HANDBOOK_QUESTIONS.map(([q]) => q),
        ...HANDBOOK_UNANSWERED,
        ...followUps,
      ].map((q) => `${model.embedding!.queryPrefix}${q}`)
    );
    const chunks: IndexedChunk[] = HANDBOOK_SECTIONS.map((text, i) => ({
      id: i,
      attachmentId: 1,
      ord: i,
      page: null,
      text,
      tokenCount: estimateTokens(text),
      embedding: new Float32Array(sections[i]),
    }));
    let found = 0;
    let chosen = 0;
    let top1 = 0;
    let top4 = 0;
    const misses: string[] = [];
    HANDBOOK_QUESTIONS.forEach(([question, answer], i) => {
      const ranked = sections
        .map((vector, index) => ({ index, score: dot(questions[i], vector) }))
        .sort((a, b) => b.score - a.score)
        .map((r) => r.index);
      const seeds = selectSeeds(chunks, questions[i], question);
      chosen += seeds.length;
      if (seeds.some((c) => c.id === answer)) found += 1;
      if (ranked[0] === answer) top1 += 1;
      if (ranked.slice(0, 4).includes(answer)) top4 += 1;
      else
        misses.push(
          `miss: ${question} → got ${ranked.slice(0, 4).join(',')}, want ${answer}`
        );
    });
    const n = HANDBOOK_QUESTIONS.length;
    const unanswered = HANDBOOK_UNANSWERED.reduce(
      (sum, q, i) => sum + selectSeeds(chunks, questions[n + i], q).length,
      0
    );
    const average = (total: number, count: number) =>
      (total / count).toFixed(1);
    const first = n + HANDBOOK_UNANSWERED.length;
    const followUp = { alone: [0, 0], joined: [0, 0] };
    HANDBOOK_FOLLOW_UPS.forEach(([, , answer], i) => {
      (['alone', 'joined'] as const).forEach((kind, k) => {
        const index = first + i * 2 + k;
        const seeds = selectSeeds(
          chunks,
          questions[index],
          followUps[i * 2 + k]
        );
        followUp[kind][0] += seeds.some((c) => c.id === answer) ? 1 : 0;
        followUp[kind][1] += seeds.length;
      });
    });
    const f = HANDBOOK_FOLLOW_UPS.length;
    setLines([
      `${model.name}: recall@1 ${top1}/${n}, recall@4 ${top4}/${n}`,
      `hybrid: found ${found}/${n}, ${average(chosen, n)} passages per question, ${average(unanswered, HANDBOOK_UNANSWERED.length)} when unanswered`,
      `follow-ups alone: found ${followUp.alone[0]}/${f}, ${followUp.alone[1]} passages; with the previous question: found ${followUp.joined[0]}/${f}, ${followUp.joined[1]} passages`,
      `${Date.now() - started} ms for ${sections.length + questions.length} texts`,
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
