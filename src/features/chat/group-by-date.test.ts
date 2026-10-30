import {
  formatBytes,
  formatDecimal,
  formatParams,
  formatPercent,
} from '@/lib/format';

import { dateGroupOf, groupByDate } from './group-by-date';

/** Local time, e.g. at('2026-10-30T09'). */
const at = (localIso: string) => new Date(`${localIso}:00:00`).getTime();
const NOW = at('2026-10-30T09');

describe('dateGroupOf', () => {
  it.each([
    [at('2026-10-30T00'), 'today'],
    [at('2026-10-29T23'), 'yesterday'],
    [at('2026-10-25T12'), 'last_7_days'],
    [at('2026-10-23T12'), 'last_7_days'],
    [at('2026-10-10T12'), 'last_30_days'],
  ])('%s is %s', (time, kind) => {
    expect(dateGroupOf(time, NOW).kind).toBe(kind);
  });

  it('groups older chats by month', () => {
    expect(dateGroupOf(at('2026-08-15T12'), NOW)).toEqual({
      kind: 'month',
      year: 2026,
      month: 7,
    });
  });
});

describe('groupByDate', () => {
  it('keeps newest-first order inside contiguous groups', () => {
    const chats = [
      { id: 1, t: at('2026-10-30T08') },
      { id: 2, t: at('2026-10-30T07') },
      { id: 3, t: at('2026-10-29T12') },
      { id: 4, t: at('2026-09-01T12') },
      { id: 5, t: at('2026-08-31T12') },
    ];
    const groups = groupByDate(chats, (c) => c.t, NOW);
    expect(groups.map((g) => [g.key, g.items.map((c) => c.id)])).toEqual([
      ['today', [1, 2]],
      ['yesterday', [3]],
      ['2026-8', [4]],
      ['2026-7', [5]],
    ]);
  });
});

describe('Vietnamese number formatting', () => {
  it('uses a decimal comma', () => {
    expect(formatDecimal(0.8)).toBe('0,8');
    expect(formatParams(1.7)).toBe('1,7');
    expect(formatParams(4)).toBe('4');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2,5 GB');
    expect(formatBytes(396 * 1024 ** 2)).toBe('396 MB');
    expect(formatPercent(0.456)).toBe('46%');
  });
});
