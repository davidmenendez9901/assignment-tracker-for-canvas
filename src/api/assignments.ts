import type { CanvasAssignment, CanvasSubmission } from '../core/types';
import type { CanvasClient } from './client';
import { readCache, writeCache, type CacheStorage } from './cache';

export function assignmentsPath(courseId: string): string {
  return `/api/v1/courses/${encodeURIComponent(courseId)}/assignments?include[]=submission&order_by=due_at&per_page=100`;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);
const id = (v: unknown): string | number | null => (typeof v === 'string' || typeof v === 'number' ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Keeps only the fields the extension uses, with the expected types.
 * Descriptions can be large and are never needed, so they are dropped before
 * anything is cached. Also used on cached data, which lives in page storage
 * that other scripts on the page could modify.
 */
export function slimAssignment(input: unknown): CanvasAssignment | null {
  const a = obj(input);
  const aid = a ? id(a.id) : null;
  if (!a || aid === null) return null;
  const sub = obj(a.submission);
  const s: CanvasSubmission | null = sub
    ? {
        score: num(sub.score),
        grade: str(sub.grade),
        submitted_at: str(sub.submitted_at),
        workflow_state: str(sub.workflow_state),
        late: bool(sub.late),
        missing: bool(sub.missing),
        excused: bool(sub.excused),
        late_policy_status: str(sub.late_policy_status),
        points_deducted: num(sub.points_deducted),
        attempt: num(sub.attempt),
        posted_at: str(sub.posted_at),
        grade_matches_current_submission: bool(sub.grade_matches_current_submission),
      }
    : null;
  const lock = obj(a.lock_info);
  const mod = lock ? obj(lock.context_module) : null;
  const topic = obj(a.discussion_topic);
  const topicId = topic ? id(topic.id) : null;
  return {
    id: aid,
    name: str(a.name),
    html_url: str(a.html_url),
    due_at: str(a.due_at),
    lock_at: str(a.lock_at),
    unlock_at: str(a.unlock_at),
    points_possible: num(a.points_possible),
    grading_type: str(a.grading_type),
    submission_types: Array.isArray(a.submission_types)
      ? a.submission_types.filter((t): t is string => typeof t === 'string')
      : null,
    allowed_attempts: num(a.allowed_attempts),
    locked_for_user: bool(a.locked_for_user),
    lock_info: lock
      ? {
          lock_at: str(lock.lock_at),
          unlock_at: str(lock.unlock_at),
          context_module: mod ? { name: str(mod.name) ?? '' } : null,
        }
      : null,
    quiz_id: id(a.quiz_id),
    discussion_topic: topicId !== null ? { id: topicId } : null,
    submission: s,
  };
}

function slimAll(list: unknown): CanvasAssignment[] {
  if (!Array.isArray(list)) return [];
  return list.map(slimAssignment).filter((a): a is CanvasAssignment => a !== null);
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
    const cached = readCache<unknown>(opts.storage, key, now());
    if (cached && Array.isArray(cached.data)) {
      return { assignments: slimAll(cached.data), fetchedAt: cached.savedAt, fromCache: true };
    }
  }
  const assignments = slimAll(await client.getAll<unknown>(assignmentsPath(courseId), opts.signal));
  const fetchedAt = now();
  writeCache(opts.storage, key, assignments, fetchedAt);
  return { assignments, fetchedAt, fromCache: false };
}
