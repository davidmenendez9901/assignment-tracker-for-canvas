import type { CanvasAssignment, CanvasSubmission } from '../core/types';
import type { CanvasClient } from './client';
import { readCache, writeCache, type CacheStorage } from './cache';

export function assignmentsPath(courseId: string): string {
  return `/api/v1/courses/${encodeURIComponent(courseId)}/assignments?include[]=submission&order_by=due_at&per_page=100`;
}

/**
 * Keeps only the fields the extension uses. Descriptions can be large and are
 * never needed, so they are dropped before anything is cached.
 */
export function slimAssignment(a: CanvasAssignment): CanvasAssignment {
  const s: CanvasSubmission | null = a.submission
    ? {
        score: a.submission.score ?? null,
        grade: a.submission.grade ?? null,
        submitted_at: a.submission.submitted_at ?? null,
        workflow_state: a.submission.workflow_state ?? null,
        late: a.submission.late ?? null,
        missing: a.submission.missing ?? null,
        excused: a.submission.excused ?? null,
        late_policy_status: a.submission.late_policy_status ?? null,
        points_deducted: a.submission.points_deducted ?? null,
        attempt: a.submission.attempt ?? null,
        posted_at: a.submission.posted_at ?? null,
        grade_matches_current_submission: a.submission.grade_matches_current_submission ?? null,
      }
    : null;
  return {
    id: a.id,
    name: a.name ?? null,
    html_url: a.html_url ?? null,
    due_at: a.due_at ?? null,
    lock_at: a.lock_at ?? null,
    unlock_at: a.unlock_at ?? null,
    points_possible: a.points_possible ?? null,
    grading_type: a.grading_type ?? null,
    submission_types: a.submission_types ?? null,
    allowed_attempts: a.allowed_attempts ?? null,
    locked_for_user: a.locked_for_user ?? null,
    lock_info: a.lock_info
      ? {
          lock_at: a.lock_info.lock_at ?? null,
          unlock_at: a.lock_info.unlock_at ?? null,
          context_module: a.lock_info.context_module
            ? { name: a.lock_info.context_module.name ?? '' }
            : null,
        }
      : null,
    quiz_id: a.quiz_id ?? null,
    discussion_topic: a.discussion_topic?.id != null ? { id: a.discussion_topic.id } : null,
    submission: s,
  };
}

export interface LoadResult {
  assignments: CanvasAssignment[];
  fetchedAt: number;
  fromCache: boolean;
}

export async function loadAssignments(
  client: CanvasClient,
  courseId: string,
  opts: { storage?: CacheStorage | null; bypassCache?: boolean; now?: () => number; signal?: AbortSignal } = {},
): Promise<LoadResult> {
  const now = opts.now ?? Date.now;
  const key = `atc:v1:assignments:${courseId}`;
  if (!opts.bypassCache) {
    const cached = readCache<CanvasAssignment[]>(opts.storage, key, now());
    if (cached) return { assignments: cached.data, fetchedAt: cached.savedAt, fromCache: true };
  }
  const raw = await client.getAll<CanvasAssignment>(assignmentsPath(courseId), opts.signal);
  const assignments = raw.filter((a) => a && a.id != null).map(slimAssignment);
  const fetchedAt = now();
  writeCache(opts.storage, key, assignments, fetchedAt);
  return { assignments, fetchedAt, fromCache: false };
}
