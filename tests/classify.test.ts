import { describe, expect, it } from 'vitest';
import { classifyAssignment, parseDate } from '../src/core/classify';
import { assignment, FAR_FUTURE, FAR_PAST, FUTURE, graded, NOW, PAST, submission } from './helpers';

const classify = (...args: Parameters<typeof assignment>) => classifyAssignment(assignment(...args), NOW);

describe('parseDate', () => {
  it('parses ISO strings and rejects empty or invalid values', () => {
    expect(parseDate('2026-03-15T12:00:00Z')).toBe(NOW);
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('scores and points', () => {
  it('flags a graded score below the max with points left', () => {
    const c = classify({}, graded(85));
    expect(c.fullPoints).toBe(false);
    expect(c.pointsLeft).toBe(15);
    expect(c.notFull).toBe(true);
  });

  it('treats a full score as complete', () => {
    const c = classify({}, graded(100));
    expect(c.fullPoints).toBe(true);
    expect(c.pointsLeft).toBeNull();
    expect(c.notFull).toBe(false);
  });

  it('reports extra credit above the max', () => {
    const c = classify({ points_possible: 10 }, graded(12));
    expect(c.fullPoints).toBe(true);
    expect(c.extraPoints).toBe(2);
    expect(c.notFull).toBe(false);
  });

  it('rounds floating-point noise in points left', () => {
    expect(classify({}, graded(85.1)).pointsLeft).toBe(14.9);
  });

  it('counts a zero score as not full', () => {
    const c = classify({}, graded(0));
    expect(c.pointsLeft).toBe(100);
    expect(c.notFull).toBe(true);
  });

  it('uses the score after late deductions and exposes the deduction', () => {
    const c = classify({}, graded(90, { late: true, late_policy_status: 'late', points_deducted: 10 }));
    expect(c.score).toBe(90);
    expect(c.pointsLeft).toBe(10);
    expect(c.pointsDeducted).toBe(10);
    expect(c.late).toBe(true);
  });

  it('handles pass/fail complete and incomplete', () => {
    const complete = classify({ grading_type: 'pass_fail', points_possible: 5 }, graded(5, { grade: 'complete' }));
    expect(complete.passFail).toBe('complete');
    expect(complete.fullPoints).toBe(true);
    expect(complete.notFull).toBe(false);

    const incomplete = classify({ grading_type: 'pass_fail', points_possible: 5 }, graded(0, { grade: 'incomplete' }));
    expect(incomplete.passFail).toBe('incomplete');
    expect(incomplete.fullPoints).toBe(false);
    expect(incomplete.notFull).toBe(true);
  });

  it('does not flag an assignment that is not due yet and not submitted as not full', () => {
    const c = classify({ due_at: FUTURE });
    expect(c.notFull).toBe(false);
    expect(c.pointsLeft).toBeNull();
  });
});

describe('ungraded and zero-point assignments', () => {
  it.each([
    ['null points_possible', { points_possible: null }],
    ['zero points_possible', { points_possible: 0 }],
    ['negative points_possible', { points_possible: -5 }],
    ['grading_type not_graded', { grading_type: 'not_graded' }],
    ['submission type not_graded', { submission_types: ['not_graded'] }],
  ])('%s is ungraded and never "missing points"', (_label, overrides) => {
    const c = classify({ due_at: PAST, ...overrides }, graded(0));
    expect(c.ungraded).toBe(true);
    expect(c.notFull).toBe(false);
    expect(c.pointsLeft).toBeNull();
    expect(c.pendingGrading).toBe(false);
  });

  it('a missing ungraded assignment is still not "not full"', () => {
    const c = classify({ points_possible: 0, due_at: PAST }, submission({ missing: true }));
    expect(c.notFull).toBe(false);
  });
});

describe('excused', () => {
  it('overrides missing, late, overdue and not-full', () => {
    const c = classify(
      { due_at: PAST },
      submission({ excused: true, missing: true, late: true, late_policy_status: 'missing' }),
    );
    expect(c.excused).toBe(true);
    expect(c.missing).toBe(false);
    expect(c.late).toBe(false);
    expect(c.overdue).toBe(false);
    expect(c.notFull).toBe(false);
    expect(c.pendingGrading).toBe(false);
  });

  it('does not compute points for an excused assignment with a score', () => {
    const c = classify({}, graded(50, { excused: true }));
    expect(c.pointsLeft).toBeNull();
    expect(c.fullPoints).toBe(false);
  });
});

describe('availability', () => {
  it('is not yet available when unlock_at is in the future', () => {
    const c = classify({ unlock_at: FUTURE, due_at: FAR_FUTURE, locked_for_user: true });
    expect(c.availability).toBe('not_yet_available');
    expect(c.lockReason).toBe('unlock_date');
  });

  it('uses lock_info.unlock_at when unlock_at is absent', () => {
    const c = classify({ unlock_at: null, locked_for_user: true, lock_info: { unlock_at: FUTURE } });
    expect(c.availability).toBe('not_yet_available');
  });

  it('is open once unlock_at has passed', () => {
    expect(classify({ unlock_at: PAST }).availability).toBe('open');
  });

  it('is closed once lock_at has passed', () => {
    const c = classify({ due_at: FAR_PAST, lock_at: PAST, locked_for_user: true });
    expect(c.availability).toBe('closed');
    expect(c.lockReason).toBe('lock_date');
  });

  it('is closed exactly at lock_at', () => {
    expect(classify({ lock_at: new Date(NOW).toISOString() }).availability).toBe('closed');
  });

  it('is open before lock_at even when past due (late submissions allowed)', () => {
    const c = classify({ due_at: PAST, lock_at: FUTURE });
    expect(c.availability).toBe('open');
    expect(c.overdue).toBe(true);
  });

  it('treats a module-locked assignment as not yet available', () => {
    const c = classify({ locked_for_user: true, lock_info: { context_module: { name: 'Week 3' } } });
    expect(c.availability).toBe('not_yet_available');
    expect(c.lockReason).toBe('module');
    expect(c.moduleName).toBe('Week 3');
  });

  it('treats locked_for_user without dates or module as closed', () => {
    const c = classify({ locked_for_user: true, lock_info: {} });
    expect(c.availability).toBe('closed');
    expect(c.lockReason).toBe('locked');
  });

  it('closed with nothing submitted counts as not full', () => {
    const c = classify({ due_at: FAR_PAST, lock_at: PAST, locked_for_user: true });
    expect(c.notFull).toBe(true);
    expect(c.overdue).toBe(false);
  });
});

describe('overdue', () => {
  it('is overdue when past due, open, unsubmitted, online', () => {
    expect(classify({ due_at: PAST }).overdue).toBe(true);
  });

  it('is never overdue without a due date', () => {
    const c = classify({ due_at: null });
    expect(c.overdue).toBe(false);
    expect(c.dueAt).toBeNull();
  });

  it('is not overdue exactly at the due time', () => {
    expect(classify({ due_at: new Date(NOW).toISOString() }).overdue).toBe(false);
  });

  it('is not overdue once submitted', () => {
    expect(classify({ due_at: PAST }, submission({ submitted_at: PAST, workflow_state: 'submitted' })).overdue).toBe(
      false,
    );
  });

  it('is not overdue when the deadline was extended', () => {
    const c = classify({ due_at: PAST }, submission({ late_policy_status: 'extended' }));
    expect(c.overdue).toBe(false);
    expect(c.extended).toBe(true);
  });

  it.each([[['on_paper']], [['none']]])('is not overdue for offline submission type %j', (types) => {
    expect(classify({ due_at: PAST, submission_types: types }).overdue).toBe(false);
  });

  it('is not overdue when a teacher already entered a score without a submission', () => {
    const c = classify({ due_at: PAST }, graded(0, { submitted_at: null }));
    expect(c.overdue).toBe(false);
    expect(c.notFull).toBe(true);
  });

  it('is overdue for an external tool (e.g. New Quizzes)', () => {
    expect(classify({ due_at: PAST, submission_types: ['external_tool'] }).overdue).toBe(true);
  });
});

describe('missing and late flags', () => {
  it('reads Canvas missing flag', () => {
    const c = classify({ due_at: PAST }, submission({ missing: true }));
    expect(c.missing).toBe(true);
    expect(c.notFull).toBe(true);
  });

  it('reads late_policy_status = missing set by a teacher', () => {
    expect(classify({ due_at: PAST, submission_types: ['on_paper'] }, submission({ late_policy_status: 'missing' })).missing).toBe(
      true,
    );
  });

  it('reads late_policy_status = late', () => {
    expect(classify({}, graded(80, { late: false, late_policy_status: 'late' })).late).toBe(true);
  });

  it('ignores late_policy_status none', () => {
    const c = classify({}, graded(80, { late_policy_status: 'none' }));
    expect(c.late).toBe(false);
    expect(c.missing).toBe(false);
  });
});

describe('workflow_state values', () => {
  it('unsubmitted: nothing pending', () => {
    const c = classify({}, submission({ workflow_state: 'unsubmitted' }));
    expect(c.submitted).toBe(false);
    expect(c.pendingGrading).toBe(false);
  });

  it('submitted: pending grading', () => {
    const c = classify({}, submission({ workflow_state: 'submitted', submitted_at: PAST, attempt: 1 }));
    expect(c.submitted).toBe(true);
    expect(c.pendingGrading).toBe(true);
    expect(c.notFull).toBe(false);
  });

  it('pending_review: pending grading', () => {
    expect(
      classify({}, submission({ workflow_state: 'pending_review', submitted_at: PAST, attempt: 1 })).pendingGrading,
    ).toBe(true);
  });

  it('graded with a visible score: not pending', () => {
    expect(classify({}, graded(90)).pendingGrading).toBe(false);
  });

  it('graded but not posted (score hidden): pending, grade hidden', () => {
    const c = classify({}, submission({ workflow_state: 'graded', submitted_at: PAST, score: null, posted_at: null }));
    expect(c.gradeHidden).toBe(true);
    expect(c.pendingGrading).toBe(true);
    expect(c.notFull).toBe(false);
  });

  it('resubmitted after grading: pending again, old score kept', () => {
    const c = classify({}, graded(70, { workflow_state: 'submitted', grade_matches_current_submission: false, attempt: 2 }));
    expect(c.pendingGrading).toBe(true);
    expect(c.score).toBe(70);
    expect(c.pointsLeft).toBe(30);
  });

  it('unknown workflow_state does not crash', () => {
    expect(() => classify({}, submission({ workflow_state: 'something_new' }))).not.toThrow();
  });
});

describe('multiple attempts', () => {
  it('offers a retry when limited attempts remain and it is open', () => {
    const c = classify({ allowed_attempts: 3 }, graded(60, { attempt: 1 }));
    expect(c.retryAvailable).toBe(true);
    expect(c.attemptsUsed).toBe(1);
    expect(c.attemptsAllowed).toBe(3);
  });

  it('no retry once all attempts are used', () => {
    expect(classify({ allowed_attempts: 2 }, graded(60, { attempt: 2 })).retryAvailable).toBe(false);
  });

  it('no retry hint for unlimited attempts (-1 or null)', () => {
    expect(classify({ allowed_attempts: -1 }, graded(60)).retryAvailable).toBe(false);
    expect(classify({ allowed_attempts: null }, graded(60)).retryAvailable).toBe(false);
    expect(classify({ allowed_attempts: -1 }, graded(60)).attemptsAllowed).toBeNull();
  });

  it('no retry when closed', () => {
    expect(
      classify({ allowed_attempts: 3, lock_at: PAST, locked_for_user: true }, graded(60, { attempt: 1 })).retryAvailable,
    ).toBe(false);
  });
});

describe('non-student roles and odd data', () => {
  it('has no student data when submission is absent', () => {
    const c = classify({ due_at: PAST }, null);
    expect(c.hasStudentData).toBe(false);
    expect(c.overdue).toBe(false);
    expect(c.notFull).toBe(false);
    expect(c.missing).toBe(false);
  });

  it('normalizes ids and names', () => {
    const c = classifyAssignment(
      { id: 42, name: '  ', quiz_id: 7, discussion_topic: { id: 9 }, submission: null },
      NOW,
    );
    expect(c.id).toBe('42');
    expect(c.name).toBe('Assignment 42');
    expect(c.quizId).toBe('7');
    expect(c.discussionTopicId).toBe('9');
  });

  it('tolerates a nearly empty assignment object', () => {
    expect(() => classifyAssignment({ id: 1 }, NOW)).not.toThrow();
    expect(classifyAssignment({ id: 1 }, NOW).ungraded).toBe(true);
  });
});
