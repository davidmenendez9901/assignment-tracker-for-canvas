import { describe, expect, it } from 'vitest';
import { classifyAll } from '../src/core/classify';
import { matchesFilter, sortByUrgency, summarize } from '../src/core/summarize';
import { assignment, FAR_FUTURE, FAR_PAST, FUTURE, graded, NOW, PAST, submission } from './helpers';

const list = classifyAll(
  [
    assignment({ id: 'full' }, graded(100)),
    assignment({ id: 'partial' }, graded(80)),
    assignment({ id: 'partial-big' }, graded(40)),
    assignment({ id: 'overdue', due_at: PAST }),
    assignment({ id: 'overdue-old', due_at: FAR_PAST }),
    assignment({ id: 'pending' }, submission({ workflow_state: 'submitted', submitted_at: PAST })),
    assignment({ id: 'closed', due_at: FAR_PAST, lock_at: PAST, locked_for_user: true }),
    assignment({ id: 'future', unlock_at: FUTURE, due_at: FAR_FUTURE, locked_for_user: true }),
    assignment({ id: 'open-soon', due_at: FUTURE }),
    assignment({ id: 'excused', due_at: PAST }, submission({ excused: true })),
    assignment({ id: 'ungraded', points_possible: 0 }),
    assignment({ id: 'missing', due_at: PAST }, submission({ missing: true })),
  ],
  NOW,
);

const ids = (filter: Parameters<typeof matchesFilter>[1]) =>
  list.filter((c) => matchesFilter(c, filter)).map((c) => c.id);

describe('filters', () => {
  it('not at 100%', () => {
    expect(ids('not_full')).toEqual(['partial', 'partial-big', 'overdue', 'overdue-old', 'closed', 'missing']);
  });
  it('open', () => {
    expect(ids('open')).not.toContain('closed');
    expect(ids('open')).not.toContain('future');
    expect(ids('open')).toContain('open-soon');
  });
  it('overdue', () => {
    expect(ids('overdue')).toEqual(['overdue', 'overdue-old', 'missing']);
  });
  it('closed', () => {
    expect(ids('closed')).toEqual(['closed']);
  });
  it('pending grading', () => {
    expect(ids('pending')).toEqual(['pending']);
  });
});

describe('summarize', () => {
  it('counts each category', () => {
    const s = summarize(list);
    expect(s.total).toBe(12);
    expect(s.byFilter.not_full).toBe(6);
    expect(s.byFilter.all).toBe(12);
    expect(s.missing).toBe(1);
    expect(s.excused).toBe(1);
    expect(s.ungraded).toBe(1);
    expect(s.notYetAvailable).toBe(1);
    expect(s.pointsLeft).toBe(80);
    expect(s.noStudentData).toBe(false);
  });

  it('detects a non-student view', () => {
    expect(summarize(classifyAll([assignment({}, null), assignment({}, null)], NOW)).noStudentData).toBe(true);
    expect(summarize([]).noStudentData).toBe(false);
  });
});

describe('sortByUrgency', () => {
  it('puts overdue first (oldest first), then upcoming, then biggest point losses', () => {
    const order = sortByUrgency(list).map((c) => c.id);
    expect(order.slice(0, 3)).toEqual(['overdue-old', 'overdue', 'missing']);
    expect(order[3]).toBe('open-soon');
    expect(order.indexOf('partial-big')).toBeLessThan(order.indexOf('partial'));
  });
});
