import type { CanvasAssignment } from './types';

export type Availability = 'not_yet_available' | 'open' | 'closed';

/** Why an assignment is not open. */
export type LockReason = 'unlock_date' | 'module' | 'lock_date' | 'locked' | null;

export interface Classification {
  id: string;
  name: string;
  /** Raw html_url from the API; the UI validates it before use. */
  htmlUrl: string | null;
  quizId: string | null;
  discussionTopicId: string | null;

  dueAt: number | null;
  unlockAt: number | null;
  lockAt: number | null;
  availability: Availability;
  lockReason: LockReason;
  moduleName: string | null;

  /** False when the API returned no submission (non-student roles). */
  hasStudentData: boolean;
  /** No points at stake: not_graded, null or zero points_possible. */
  ungraded: boolean;
  excused: boolean;
  submitted: boolean;
  /** Can be submitted online (not on paper, not "no submission"). */
  onlineSubmittable: boolean;

  missing: boolean;
  late: boolean;
  extended: boolean;
  /** Open, past due, not submitted, not excused/extended, no score yet. */
  overdue: boolean;

  /** Submitted and waiting for a (re)grade, or graded but not posted to the student. */
  pendingGrading: boolean;
  /** Graded, but the score is hidden from the student (manual posting policy). */
  gradeHidden: boolean;

  score: number | null;
  pointsPossible: number | null;
  passFail: 'complete' | 'incomplete' | null;
  fullPoints: boolean;
  /** Points still missing from the max, when a score below the max is visible. */
  pointsLeft: number | null;
  /** Points above the max (extra credit). */
  extraPoints: number | null;
  pointsDeducted: number | null;

  attemptsUsed: number;
  /** null means unlimited. */
  attemptsAllowed: number | null;
  /** A limited number of attempts remains and the assignment is still open. */
  retryAvailable: boolean;

  /** Member of the "Not at 100%" filter. */
  notFull: boolean;
}

const EPSILON = 1e-9;
const OFFLINE_SUBMISSION_TYPES = new Set(['none', 'on_paper', 'not_graded']);

export function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function idOrNull(value: unknown): string | null {
  return value === null || value === undefined || value === '' ? null : String(value);
}

export function classifyAssignment(a: CanvasAssignment, now: number): Classification {
  const s = a.submission ?? null;
  const hasStudentData = s !== null;

  const pointsPossible =
    typeof a.points_possible === 'number' && Number.isFinite(a.points_possible) ? a.points_possible : null;
  const submissionTypes = a.submission_types ?? [];
  const ungraded =
    a.grading_type === 'not_graded' ||
    pointsPossible === null ||
    pointsPossible <= 0 ||
    submissionTypes.includes('not_graded');
  const onlineSubmittable =
    submissionTypes.length > 0 && submissionTypes.some((t) => !OFFLINE_SUBMISSION_TYPES.has(t));

  // Availability. For a student, Canvas already applies their overrides to these dates.
  const dueAt = parseDate(a.due_at);
  const unlockAt = parseDate(a.unlock_at ?? a.lock_info?.unlock_at);
  const lockAt = parseDate(a.lock_at ?? a.lock_info?.lock_at);
  const moduleName = a.lock_info?.context_module?.name ?? null;

  let availability: Availability = 'open';
  let lockReason: LockReason = null;
  if (unlockAt !== null && now < unlockAt) {
    availability = 'not_yet_available';
    lockReason = 'unlock_date';
  } else if (lockAt !== null && now >= lockAt) {
    availability = 'closed';
    lockReason = 'lock_date';
  } else if (a.locked_for_user) {
    if (a.lock_info?.context_module) {
      // Locked behind module prerequisites: it becomes available once they are done.
      availability = 'not_yet_available';
      lockReason = 'module';
    } else {
      availability = 'closed';
      lockReason = 'locked';
    }
  }

  // Submission state.
  const workflowState = s?.workflow_state ?? null;
  const excused = s?.excused === true;
  const submitted = parseDate(s?.submitted_at) !== null;
  const score = typeof s?.score === 'number' && Number.isFinite(s.score) ? s.score : null;
  const scoreVisible = score !== null;
  const latePolicy = s?.late_policy_status ?? null;
  const missing = hasStudentData && !excused && (s?.missing === true || latePolicy === 'missing');
  const late = hasStudentData && !excused && (s?.late === true || latePolicy === 'late');
  const extended = latePolicy === 'extended';
  const pointsDeducted =
    typeof s?.points_deducted === 'number' && s.points_deducted > 0 ? s.points_deducted : null;

  const gradeHidden = hasStudentData && !excused && !scoreVisible && workflowState === 'graded';
  const awaitingGrade =
    submitted &&
    (workflowState === 'submitted' ||
      workflowState === 'pending_review' ||
      s?.grade_matches_current_submission === false);
  const pendingGrading = hasStudentData && !excused && !ungraded && (awaitingGrade || gradeHidden);

  let passFail: Classification['passFail'] = null;
  if (a.grading_type === 'pass_fail' && hasStudentData) {
    if (s?.grade === 'complete') passFail = 'complete';
    else if (s?.grade === 'incomplete') passFail = 'incomplete';
  }

  let fullPoints = false;
  let pointsLeft: number | null = null;
  let extraPoints: number | null = null;
  if (!ungraded && !excused && pointsPossible !== null) {
    if (a.grading_type === 'pass_fail' && passFail !== null) {
      fullPoints = passFail === 'complete';
    } else if (scoreVisible) {
      fullPoints = score >= pointsPossible - EPSILON;
      if (fullPoints && score > pointsPossible + EPSILON) extraPoints = roundPoints(score - pointsPossible);
      if (!fullPoints) pointsLeft = roundPoints(pointsPossible - score);
    }
  }

  const overdue =
    hasStudentData &&
    availability === 'open' &&
    dueAt !== null &&
    now > dueAt &&
    !submitted &&
    !excused &&
    !extended &&
    !scoreVisible &&
    onlineSubmittable;

  const attemptsUsed = typeof s?.attempt === 'number' && s.attempt > 0 ? s.attempt : 0;
  const attemptsAllowed =
    typeof a.allowed_attempts === 'number' && a.allowed_attempts > 0 ? a.allowed_attempts : null;
  const retryAvailable =
    hasStudentData &&
    availability === 'open' &&
    submitted &&
    !excused &&
    onlineSubmittable &&
    attemptsAllowed !== null &&
    attemptsUsed < attemptsAllowed;

  const closedWithNothing = availability === 'closed' && !submitted && !scoreVisible;
  const notFull =
    hasStudentData &&
    !ungraded &&
    !excused &&
    ((scoreVisible || passFail !== null ? !fullPoints : false) || missing || overdue || closedWithNothing);

  return {
    id: String(a.id),
    name: a.name?.trim() || `Assignment ${a.id}`,
    htmlUrl: a.html_url ?? null,
    quizId: idOrNull(a.quiz_id),
    discussionTopicId: idOrNull(a.discussion_topic?.id),
    dueAt,
    unlockAt,
    lockAt,
    availability,
    lockReason,
    moduleName,
    hasStudentData,
    ungraded,
    excused,
    submitted,
    onlineSubmittable,
    missing,
    late,
    extended,
    overdue,
    pendingGrading,
    gradeHidden,
    score,
    pointsPossible,
    passFail,
    fullPoints,
    pointsLeft,
    extraPoints,
    pointsDeducted,
    attemptsUsed,
    attemptsAllowed,
    retryAvailable,
    notFull,
  };
}

export function classifyAll(assignments: readonly CanvasAssignment[], now: number): Classification[] {
  return assignments.map((a) => classifyAssignment(a, now));
}

/** Rounds away floating-point noise (e.g. 100 - 85.1). */
export function roundPoints(n: number): number {
  return Math.round(n * 100) / 100;
}
