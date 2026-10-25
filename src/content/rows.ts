import type { Classification } from '../core/classify';

/**
 * The student Assignments index (and a course home set to "Assignments List")
 * renders its groups inside #ag-list. Rows are matched by their links rather
 * than by layout classes, which change more often.
 */
export const LIST_ROOT_SELECTOR = '#ag-list';

/** Our own nodes; never treat links inside them as Canvas rows. */
export const OWN_ROOT_SELECTOR = '.atc-root';

const LINK_RE = /^\/courses\/([^/]+)\/(assignments|quizzes|discussion_topics)\/(\d+)\/?$/;

type LinkKind = 'assignments' | 'quizzes' | 'discussion_topics';

function key(kind: LinkKind, id: string): string {
  return `${kind}:${id}`;
}

/** Maps every link target an assignment row may use to its classification. */
export function buildIndex(list: readonly Classification[]): Map<string, Classification> {
  const index = new Map<string, Classification>();
  for (const c of list) {
    index.set(key('assignments', c.id), c);
    // Classic quizzes and graded discussions link to their own pages.
    if (c.quizId) index.set(key('quizzes', c.quizId), c);
    if (c.discussionTopicId) index.set(key('discussion_topics', c.discussionTopicId), c);
  }
  return index;
}

export interface RowMatch {
  /** Element the badges are appended to. */
  host: Element;
  classification: Classification;
}

export function findRows(
  root: ParentNode,
  index: Map<string, Classification>,
  ctx: { origin: string; courseId: string },
): RowMatch[] {
  const matches: RowMatch[] = [];
  const seenHosts = new Set<Element>();
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    if (anchor.closest(OWN_ROOT_SELECTOR)) continue;
    let url: URL;
    try {
      url = new URL(anchor.getAttribute('href') ?? '', ctx.origin);
    } catch {
      continue;
    }
    if (url.origin !== ctx.origin) continue;
    const m = LINK_RE.exec(url.pathname);
    if (!m || m[1] !== ctx.courseId) continue;
    const c = index.get(key(m[2] as LinkKind, m[3] ?? ''));
    if (!c) continue;
    const host = anchor.closest('.ig-info') ?? anchor.parentElement;
    if (!host || seenHosts.has(host)) continue;
    seenHosts.add(host);
    matches.push({ host, classification: c });
  }
  return matches;
}
