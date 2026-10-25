import type { Classification } from './classify';

export type FilterId = 'not_full' | 'open' | 'overdue' | 'closed' | 'pending' | 'all';

export const FILTERS: ReadonlyArray<{ id: FilterId; label: string }> = [
  { id: 'not_full', label: 'Not at 100%' },
  { id: 'open', label: 'Open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'closed', label: 'Closed' },
  { id: 'pending', label: 'Pending grading' },
  { id: 'all', label: 'All' },
];

export function isFilterId(value: unknown): value is FilterId {
  return FILTERS.some((f) => f.id === value);
}

export function matchesFilter(c: Classification, filter: FilterId): boolean {
  switch (filter) {
    case 'not_full':
      return c.notFull;
    case 'open':
      return c.availability === 'open';
    case 'overdue':
      return c.overdue;
    case 'closed':
      return c.availability === 'closed';
    case 'pending':
      return c.pendingGrading;
    case 'all':
      return true;
  }
}

export interface Summary {
  total: number;
  byFilter: Record<FilterId, number>;
  missing: number;
  late: number;
  excused: number;
  ungraded: number;
  notYetAvailable: number;
  /** Sum of points still missing across graded assignments below full score. */
  pointsLeft: number;
  /** True when no assignment carried student submission data (non-student role). */
  noStudentData: boolean;
}

export function summarize(list: readonly Classification[]): Summary {
  const byFilter = Object.fromEntries(
    FILTERS.map((f) => [f.id, list.filter((c) => matchesFilter(c, f.id)).length]),
  ) as Record<FilterId, number>;
  const pointsLeft = list.reduce((sum, c) => sum + (c.pointsLeft ?? 0), 0);
  return {
    total: list.length,
    byFilter,
    missing: list.filter((c) => c.missing).length,
    late: list.filter((c) => c.late).length,
    excused: list.filter((c) => c.excused).length,
    ungraded: list.filter((c) => c.ungraded).length,
    notYetAvailable: list.filter((c) => c.availability === 'not_yet_available').length,
    pointsLeft: Math.round(pointsLeft * 100) / 100,
    noStudentData: list.length > 0 && list.every((c) => !c.hasStudentData),
  };
}

/**
 * Most urgent first: overdue (oldest due date first), then open work with a
 * due date (soonest first), then graded work with the most points lost, then
 * everything else by due date. Ties keep API order.
 */
export function sortByUrgency(list: readonly Classification[]): Classification[] {
  const rank = (c: Classification): number => {
    if (c.overdue || (c.missing && c.availability === 'open')) return 0;
    if (c.availability === 'open' && !c.submitted && !c.excused && !c.ungraded && c.dueAt !== null) return 1;
    if (c.pointsLeft !== null) return 2;
    return 3;
  };
  const due = (c: Classification): number => c.dueAt ?? Number.POSITIVE_INFINITY;
  return list
    .map((c, index) => ({ c, index }))
    .sort((x, y) => {
      const r = rank(x.c) - rank(y.c);
      if (r !== 0) return r;
      if (rank(x.c) === 2) {
        const p = (y.c.pointsLeft ?? 0) - (x.c.pointsLeft ?? 0);
        if (p !== 0) return p;
      }
      const d = due(x.c) - due(y.c);
      if (d !== 0 && !Number.isNaN(d)) return d;
      return x.index - y.index;
    })
    .map(({ c }) => c);
}
