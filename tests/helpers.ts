import type { CanvasAssignment, CanvasSubmission } from '../src/core/types';

export const NOW = Date.parse('2026-03-15T12:00:00Z');
export const PAST = '2026-03-10T23:59:00Z';
export const FAR_PAST = '2026-03-01T23:59:00Z';
export const FUTURE = '2026-03-20T23:59:00Z';
export const FAR_FUTURE = '2026-04-01T23:59:00Z';

export function submission(overrides: Partial<CanvasSubmission> = {}): CanvasSubmission {
  return {
    score: null,
    grade: null,
    submitted_at: null,
    workflow_state: 'unsubmitted',
    late: false,
    missing: false,
    excused: false,
    late_policy_status: null,
    points_deducted: null,
    attempt: null,
    posted_at: null,
    grade_matches_current_submission: true,
    ...overrides,
  };
}

export function graded(score: number, overrides: Partial<CanvasSubmission> = {}): CanvasSubmission {
  return submission({
    score,
    grade: String(score),
    submitted_at: PAST,
    workflow_state: 'graded',
    attempt: 1,
    posted_at: PAST,
    ...overrides,
  });
}

let nextId = 1;

export function assignment(
  overrides: Partial<CanvasAssignment> = {},
  sub: CanvasSubmission | null = submission(),
): CanvasAssignment {
  const id = overrides.id ?? nextId++;
  return {
    id,
    name: `Assignment ${id}`,
    html_url: `https://school.instructure.com/courses/1/assignments/${id}`,
    due_at: FUTURE,
    lock_at: null,
    unlock_at: null,
    points_possible: 100,
    grading_type: 'points',
    submission_types: ['online_upload'],
    allowed_attempts: -1,
    locked_for_user: false,
    lock_info: null,
    submission: sub,
    ...overrides,
  };
}
