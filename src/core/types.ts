/**
 * The subset of the Canvas REST API shapes this extension reads.
 * See https://canvas.instructure.com/doc/api/assignments.html and
 * https://canvas.instructure.com/doc/api/submissions.html
 *
 * Every field is treated as possibly missing: Canvas versions and
 * institution settings differ, and fields are omitted for some roles.
 */

export type Id = number | string;

export type GradingType =
  | 'pass_fail'
  | 'percent'
  | 'letter_grade'
  | 'gpa_scale'
  | 'points'
  | 'not_graded';

export type SubmissionWorkflowState = 'submitted' | 'unsubmitted' | 'graded' | 'pending_review';

export type LatePolicyStatus = 'late' | 'missing' | 'extended' | 'none';

export interface LockInfo {
  lock_at?: string | null;
  unlock_at?: string | null;
  can_view?: boolean;
  asset_string?: string;
  context_module?: { id?: Id; name?: string } | null;
}

export interface CanvasSubmission {
  assignment_id?: Id;
  score?: number | null;
  grade?: string | null;
  submitted_at?: string | null;
  workflow_state?: SubmissionWorkflowState | string | null;
  late?: boolean | null;
  missing?: boolean | null;
  excused?: boolean | null;
  late_policy_status?: LatePolicyStatus | string | null;
  points_deducted?: number | null;
  attempt?: number | null;
  posted_at?: string | null;
  grade_matches_current_submission?: boolean | null;
}

export interface CanvasAssignment {
  id: Id;
  name?: string | null;
  html_url?: string | null;
  due_at?: string | null;
  lock_at?: string | null;
  unlock_at?: string | null;
  points_possible?: number | null;
  grading_type?: GradingType | string | null;
  submission_types?: string[] | null;
  /** -1 or null means unlimited. */
  allowed_attempts?: number | null;
  locked_for_user?: boolean | null;
  lock_info?: LockInfo | null;
  quiz_id?: Id | null;
  discussion_topic?: { id?: Id | null } | null;
  omit_from_final_grade?: boolean | null;
  /** Present when requested with include[]=submission and the caller is a student. */
  submission?: CanvasSubmission | null;
}
