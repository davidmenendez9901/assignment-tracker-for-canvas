export interface Route {
  courseId: string;
  /** The course home can be configured to show the assignments list. */
  page: 'assignments' | 'course_home';
}

// Course ids are numeric, or "shard~id" global ids on some instances.
const ROUTE_RE = /^\/courses\/(\d+(?:~\d+)?)(\/assignments)?\/?$/;

export function parseRoute(pathname: string): Route | null {
  const m = ROUTE_RE.exec(pathname);
  if (!m?.[1]) return null;
  return { courseId: m[1], page: m[2] ? 'assignments' : 'course_home' };
}

/** Cheap check that this is a Canvas page before doing anything on a custom domain. */
export function isCanvasPage(doc: Document): boolean {
  return doc.querySelector('#application.ic-app, .ic-app') !== null;
}
