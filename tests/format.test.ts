import { describe, expect, it } from 'vitest';
import { classifyAssignment } from '../src/core/classify';
import { ariaSummary, badgeParts, badgeSignature, formatPoints, formatRelative } from '../src/core/format';
import { assignment, FUTURE, graded, NOW, PAST, submission } from './helpers';

const opts = { now: NOW, locale: 'en-US', timeZone: 'UTC' };
const texts = (...args: Parameters<typeof assignment>) =>
  badgeParts(classifyAssignment(assignment(...args), NOW), opts).map((p) => p.text);

describe('formatPoints', () => {
  it('trims decimals', () => {
    expect(formatPoints(85)).toBe('85');
    expect(formatPoints(85.5)).toBe('85.5');
    expect(formatPoints(85.256)).toBe('85.26');
  });
});

describe('badgeParts', () => {
  it('score with points left', () => {
    expect(texts({}, graded(85))).toEqual(['85/100 · 15 pts left']);
  });

  it('singular point', () => {
    expect(texts({ points_possible: 10 }, graded(9))).toEqual(['9/10 · 1 pt left']);
  });

  it('full score is subtle', () => {
    const parts = badgeParts(classifyAssignment(assignment({}, graded(100)), NOW), opts);
    expect(parts[0]?.text).toBe('100/100');
    expect(parts[0]?.subtle).toBe(true);
  });

  it('extra credit', () => {
    expect(texts({ points_possible: 10 }, graded(12))).toEqual(['12/10 · +2 extra']);
  });

  it('overdue', () => {
    expect(texts({ due_at: PAST })).toEqual(['Overdue']);
  });

  it('missing replaces overdue', () => {
    expect(texts({ due_at: PAST }, submission({ missing: true }))).toEqual(['Missing']);
  });

  it('late with deduction', () => {
    expect(texts({}, graded(90, { late: true, points_deducted: 10 }))).toEqual(['90/100 · 10 pts left', 'Late (−10)']);
  });

  it('closed with nothing submitted', () => {
    expect(texts({ due_at: PAST, lock_at: PAST, locked_for_user: true })).toEqual(['Closed · not submitted']);
  });

  it('closed after grading', () => {
    expect(texts({ due_at: PAST, lock_at: PAST, locked_for_user: true }, graded(100))).toEqual(['100/100', 'Closed']);
  });

  it('not yet available shows the opening date', () => {
    expect(texts({ unlock_at: '2026-03-20T15:00:00Z', locked_for_user: true })).toEqual(['Opens Mar 20, 3:00 PM']);
  });

  it('module lock', () => {
    expect(texts({ locked_for_user: true, lock_info: { context_module: { name: 'Week 3' } } })).toEqual([
      'Locked (module)',
    ]);
  });

  it('pending grading and hidden grades', () => {
    expect(texts({}, submission({ workflow_state: 'submitted', submitted_at: PAST }))).toEqual([
      'Submitted · awaiting grade',
    ]);
    expect(texts({}, submission({ workflow_state: 'graded', submitted_at: PAST }))).toEqual(['Grade not posted']);
  });

  it('resubmission awaiting regrade', () => {
    expect(texts({}, graded(70, { workflow_state: 'submitted', grade_matches_current_submission: false }))).toEqual([
      '70/100 · 30 pts left',
      'Awaiting regrade',
    ]);
  });

  it('excused and ungraded', () => {
    expect(texts({ due_at: PAST }, submission({ excused: true }))).toEqual(['Excused']);
    expect(texts({ points_possible: null })).toEqual(['No points']);
  });

  it('retry available', () => {
    expect(texts({ allowed_attempts: 3 }, graded(60, { attempt: 1 }))).toEqual([
      '60/100 · 40 pts left',
      'Retry available (1/3 used)',
    ]);
  });

  it('open only when requested', () => {
    const c = classifyAssignment(assignment({ due_at: FUTURE, lock_at: FUTURE }), NOW);
    expect(badgeParts(c, opts).map((p) => p.text)).toEqual(['Due in 5 days']);
    expect(badgeParts(c, { ...opts, includeOpen: true }).map((p) => p.text)).toEqual([
      'Due in 5 days',
      'Open until Mar 20, 11:59 PM',
    ]);
  });

  it('upcoming work: subtle when far, highlighted when due within 48 hours', () => {
    const far = badgeParts(classifyAssignment(assignment({ due_at: FUTURE }), NOW), opts)[0]!;
    expect(far).toMatchObject({ text: 'Due in 5 days', tone: 'neutral', subtle: true });

    const soon = badgeParts(classifyAssignment(assignment({ due_at: '2026-03-16T09:00:00Z' }), NOW), opts)[0]!;
    expect(soon).toMatchObject({ text: 'Due in 21 hours', tone: 'warning', subtle: false });
    expect(soon.label).toBe('Not submitted yet, due in 21 hours');
  });

  it('no upcoming badge once submitted, without a due date, or for ungraded work', () => {
    expect(texts({ due_at: FUTURE }, submission({ submitted_at: PAST, workflow_state: 'submitted' }))).toEqual([
      'Submitted · awaiting grade',
    ]);
    expect(texts({ due_at: null })).toEqual([]);
    expect(texts({ due_at: FUTURE, points_possible: 0 })).toEqual(['No points']);
  });

  it('formatRelative', () => {
    expect(formatRelative(NOW + 30 * 60_000, NOW)).toBe('in 30 minutes');
    expect(formatRelative(NOW + 3 * 3_600_000, NOW)).toBe('in 3 hours');
    expect(formatRelative(NOW + 3 * 86_400_000, NOW)).toBe('in 3 days');
  });

  it('nothing for non-student roles', () => {
    expect(texts({ due_at: PAST }, null)).toEqual([]);
  });

  it('every part has a non-empty label (not color-only)', () => {
    const c = classifyAssignment(assignment({ due_at: PAST, allowed_attempts: 2 }, graded(50, { late: true })), NOW);
    for (const p of badgeParts(c, { ...opts, includeOpen: true })) {
      expect(p.text.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
    }
  });
});

describe('ariaSummary and signature', () => {
  it('describes the badge in words', () => {
    const c = classifyAssignment(assignment({}, graded(85)), NOW);
    expect(ariaSummary(c, opts)).toBe('Assignment Tracker: Score 85 out of 100, 15 points below full score');
  });

  it('signature changes when the state changes', () => {
    const a = classifyAssignment(assignment({ id: 1 }, graded(85)), NOW);
    const b = classifyAssignment(assignment({ id: 1 }, graded(90)), NOW);
    expect(badgeSignature(a, opts)).not.toBe(badgeSignature(b, opts));
  });
});
