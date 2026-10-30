export type DateGroupKey =
  | { kind: 'today' }
  | { kind: 'yesterday' }
  | { kind: 'last_7_days' }
  | { kind: 'last_30_days' }
  | { kind: 'month'; year: number; month: number };

export type DateGroup<T> = { key: string; group: DateGroupKey; items: T[] };

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(time: number): number {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Buckets by local calendar day: Today, Yesterday, 7 days, 30 days, then by month. */
export function dateGroupOf(time: number, now: number): DateGroupKey {
  const today = startOfDay(now);
  // Calendar-day difference, safe across daylight-saving changes.
  const days = Math.round((today - startOfDay(time)) / DAY);
  if (days <= 0) return { kind: 'today' };
  if (days === 1) return { kind: 'yesterday' };
  if (days <= 7) return { kind: 'last_7_days' };
  if (days <= 30) return { kind: 'last_30_days' };
  const d = new Date(time);
  return { kind: 'month', year: d.getFullYear(), month: d.getMonth() };
}

function keyOf(group: DateGroupKey): string {
  return group.kind === 'month' ? `${group.year}-${group.month}` : group.kind;
}

/** Items must already be sorted newest first. */
export function groupByDate<T>(
  items: T[],
  timeOf: (item: T) => number,
  now = Date.now()
): DateGroup<T>[] {
  const groups: DateGroup<T>[] = [];
  for (const item of items) {
    const group = dateGroupOf(timeOf(item), now);
    const key = keyOf(group);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.items.push(item);
    else groups.push({ key, group, items: [item] });
  }
  return groups;
}
