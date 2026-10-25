import { loadAssignments } from '../api/assignments';
import { CanvasApiError, createClient } from '../api/client';
import { classifyAll, type Classification } from '../core/classify';
import type { FormatOptions } from '../core/format';
import { summarize } from '../core/summarize';
import { decorateRows } from './badges';
import { createPanel, type Panel } from './panel';
import { loadPrefs, savePrefs } from './prefs';
import { isCanvasPage, parseRoute, type Route } from './route';
import { buildIndex, findRows, LIST_ROOT_SELECTOR } from './rows';
import { detectTheme, themeClasses } from './theme';

const LIST_WAIT_MS = 15_000;
const DEBOUNCE_MS = 150;

function safeStorage(name: 'sessionStorage' | 'localStorage'): Storage | null {
  try {
    return window[name];
  } catch {
    return null;
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/** Resolves with the element once it exists, or null after the timeout. */
function waitFor(selector: string, timeoutMs: number): Promise<Element | null> {
  const found = document.querySelector(selector);
  if (found) return Promise.resolve(found);
  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    const timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

function sameIds(a: Set<string> | null, b: Set<string> | null): boolean {
  if (a === null || b === null) return a === b;
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function errorMessage(err: unknown): string {
  if (err instanceof CanvasApiError) return err.message;
  return 'Something went wrong while loading assignments.';
}

async function main(route: Route): Promise<void> {
  const origin = location.origin;
  const localStore = safeStorage('localStorage');
  const sessionStore = safeStorage('sessionStorage');
  const client = createClient({ origin });
  const formatOptions = (): FormatOptions => ({ now: Date.now() });
  const classes = themeClasses(detectTheme(document));

  // On the course home, only act if it is configured to show the assignments list.
  const listPromise = waitFor(LIST_ROOT_SELECTOR, route.page === 'course_home' ? 5_000 : LIST_WAIT_MS);
  if (route.page === 'course_home' && !(await listPromise)) return;

  const panel: Panel = createPanel({
    origin,
    courseId: route.courseId,
    prefs: loadPrefs(localStore),
    themeClasses: classes,
    formatOptions,
    onPrefsChange: (p) => savePrefs(localStore, p),
    onRefresh: () => void load(true),
  });

  const mountPanel = (): void => {
    if (panel.root.isConnected) return;
    const list = document.querySelector(LIST_ROOT_SELECTOR);
    if (list?.parentElement) list.parentElement.insertBefore(panel.root, list);
    else (document.querySelector('#content') ?? document.body).prepend(panel.root);
  };
  mountPanel();

  let classifications: Classification[] = [];
  let fetchedAt = 0;

  const decorate = (): Set<string> | null => {
    const listRoot = document.querySelector(LIST_ROOT_SELECTOR);
    if (!listRoot || classifications.length === 0) return null;
    const rows = findRows(listRoot, buildIndex(classifications), { origin, courseId: route.courseId });
    decorateRows(rows, formatOptions(), classes);
    return rows.length > 0 ? new Set(rows.map((r) => r.classification.id)) : null;
  };

  let listedIds: Set<string> | null = null;
  const render = (): void => {
    listedIds = decorate();
    panel.setData({ list: classifications, summary: summarize(classifications), fetchedAt, listedIds });
  };

  async function load(bypassCache: boolean): Promise<void> {
    panel.setLoading();
    try {
      const result = await loadAssignments(client, route.courseId, { storage: sessionStore, bypassCache });
      classifications = classifyAll(result.assignments, Date.now());
      fetchedAt = result.fetchedAt;
      render();
    } catch (err) {
      panel.setError(errorMessage(err));
    }
  }

  await load(false);

  // Canvas renders and re-renders rows client-side (show by date/type, collapsing
  // groups). Re-apply badges after changes; decorateRows is a no-op when nothing changed.
  const onMutation = debounce(() => {
    try {
      mountPanel();
      if (!classifications.length) return;
      // Re-render the panel only when the set of listed rows changed, so focus
      // inside the panel is not lost on unrelated page updates.
      const ids = decorate();
      if (!sameIds(ids, listedIds)) render();
    } catch {
      // Never let a decoration error surface on the page.
    }
  }, DEBOUNCE_MS);
  await listPromise;
  const observeTarget = document.querySelector('#content') ?? document.body;
  new MutationObserver((records) => {
    // Ignore mutations caused only by our own nodes.
    const external = records.some(
      (r) => !(r.target instanceof Element && r.target.closest('.atc-root')) &&
        ![...r.addedNodes, ...r.removedNodes].every((n) => n instanceof Element && n.classList.contains('atc-root')),
    );
    if (external) onMutation();
  }).observe(observeTarget, { childList: true, subtree: true });
}

function start(): void {
  const route = parseRoute(location.pathname);
  if (!route || !isCanvasPage(document)) return;
  // Guard against double injection (manifest + dynamically registered script).
  // Both run in the same isolated world, so a global is enough and the page DOM is untouched.
  const g = globalThis as { __atcInitialized?: boolean };
  if (g.__atcInitialized) return;
  g.__atcInitialized = true;
  main(route).catch(() => {
    // Fail closed: the page keeps working without the extension.
  });
}

try {
  start();
} catch {
  // See above.
}
