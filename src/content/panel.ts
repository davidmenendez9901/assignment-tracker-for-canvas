import type { Classification } from '../core/classify';
import { formatDate, formatDue, formatPoints, type FormatOptions } from '../core/format';
import { FILTERS, matchesFilter, sortByUrgency, type FilterId, type Summary } from '../core/summarize';
import { renderBadgeGroup } from './badges';
import { icon } from './icons';
import type { Prefs } from './prefs';

export interface PanelData {
  list: Classification[];
  summary: Summary;
  fetchedAt: number;
  /** Ids of assignments that have a row on this page, or null if rows could not be matched. */
  listedIds: Set<string> | null;
}

export interface PanelOptions {
  origin: string;
  courseId: string;
  prefs: Prefs;
  themeClasses: readonly string[];
  formatOptions: () => FormatOptions;
  onPrefsChange: (prefs: Prefs) => void;
  onRefresh: () => void;
}

export interface Panel {
  root: HTMLElement;
  setLoading(): void;
  setError(message: string): void;
  setData(data: PanelData): void;
}

const REFRESH_COOLDOWN_MS = 10_000;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Only same-origin http(s) links from API data are used; anything else falls back to a built path. */
export function safeAssignmentHref(c: Classification, origin: string, courseId: string): string {
  const fallback = `${origin}/courses/${encodeURIComponent(courseId)}/assignments/${encodeURIComponent(c.id)}`;
  if (!c.htmlUrl) return fallback;
  try {
    const url = new URL(c.htmlUrl, origin);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin === origin) return url.href;
  } catch {
    // Fall through.
  }
  return fallback;
}

export function headline(summary: Summary): string {
  if (summary.total === 0) return 'No assignments';
  if (summary.noStudentData) return 'No student grades for your role';
  const bits = [`${summary.byFilter.not_full} not at 100%`];
  if (summary.byFilter.overdue) bits.push(`${summary.byFilter.overdue} overdue`);
  if (summary.byFilter.pending) bits.push(`${summary.byFilter.pending} pending grading`);
  if (summary.pointsLeft > 0) bits.push(`${formatPoints(summary.pointsLeft)} pts left`);
  return bits.join(' · ');
}

export function createPanel(o: PanelOptions): Panel {
  let prefs = { ...o.prefs };
  let data: PanelData | null = null;
  let lastRefresh = 0;

  const root = el('section', ['atc-root', 'atc-panel', ...o.themeClasses].join(' '));
  root.setAttribute('aria-labelledby', 'atc-heading');

  // Header: a disclosure button inside a heading.
  const heading = el('h2', 'atc-heading');
  heading.id = 'atc-heading';
  const toggle = el('button', 'atc-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'atc-body');
  toggle.appendChild(icon('chevron', 'atc-icon atc-chevron'));
  toggle.appendChild(el('span', 'atc-title', 'Assignment Tracker'));
  const headlineEl = el('span', 'atc-headline', 'Loading…');
  toggle.appendChild(headlineEl);
  heading.appendChild(toggle);
  root.appendChild(heading);

  const body = el('div', 'atc-body');
  body.id = 'atc-body';
  root.appendChild(body);

  const status = el('p', 'atc-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  body.appendChild(status);

  const stats = el('ul', 'atc-stats');
  stats.setAttribute('aria-label', 'Summary');
  body.appendChild(stats);

  const filters = el('div', 'atc-filters');
  filters.setAttribute('role', 'group');
  filters.setAttribute('aria-label', 'Filter assignments');
  body.appendChild(filters);
  const filterButtons = new Map<FilterId, HTMLButtonElement>();
  for (const f of FILTERS) {
    const b = el('button', 'atc-filter');
    b.type = 'button';
    b.dataset.filter = f.id;
    b.addEventListener('click', () => {
      prefs = { ...prefs, filter: f.id };
      o.onPrefsChange(prefs);
      renderList(true);
    });
    filters.appendChild(b);
    filterButtons.set(f.id, b);
  }

  const scope = el('label', 'atc-scope');
  const scopeBox = el('input');
  scopeBox.type = 'checkbox';
  scopeBox.addEventListener('change', () => {
    prefs = { ...prefs, onlyListed: scopeBox.checked };
    o.onPrefsChange(prefs);
    renderList(true);
  });
  const scopeText = el('span');
  scope.append(scopeBox, scopeText);
  scope.hidden = true;
  body.appendChild(scope);

  const listEl = el('ul', 'atc-list');
  body.appendChild(listEl);
  const empty = el('p', 'atc-empty');
  empty.hidden = true;
  body.appendChild(empty);

  const footer = el('div', 'atc-footer');
  const refresh = el('button', 'atc-refresh');
  refresh.type = 'button';
  refresh.appendChild(icon('refresh'));
  refresh.appendChild(el('span', undefined, 'Refresh'));
  refresh.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastRefresh < REFRESH_COOLDOWN_MS) return;
    lastRefresh = now;
    o.onRefresh();
  });
  const meta = el('span', 'atc-meta');
  footer.append(refresh, meta);
  body.appendChild(footer);

  toggle.addEventListener('click', () => {
    prefs = { ...prefs, collapsed: !prefs.collapsed };
    o.onPrefsChange(prefs);
    applyCollapsed();
  });

  function applyCollapsed(): void {
    toggle.setAttribute('aria-expanded', String(!prefs.collapsed));
    body.hidden = prefs.collapsed;
    root.classList.toggle('atc-collapsed', prefs.collapsed);
  }

  function visibleBase(): Classification[] {
    if (!data) return [];
    if (prefs.onlyListed && data.listedIds) return data.list.filter((c) => data?.listedIds?.has(c.id));
    return data.list;
  }

  function renderStats(summary: Summary): void {
    stats.replaceChildren();
    const items: Array<[string, number]> = [
      ['Missing', summary.missing],
      ['Late', summary.late],
      ['Not yet available', summary.notYetAvailable],
      ['Excused', summary.excused],
      ['No points', summary.ungraded],
    ];
    for (const [label, count] of items) {
      if (count === 0) continue;
      const li = el('li', 'atc-stat');
      li.append(el('span', 'atc-stat-count', String(count)), el('span', 'atc-stat-label', label));
      stats.appendChild(li);
    }
    stats.hidden = stats.childElementCount === 0;
  }

  function renderList(announce: boolean): void {
    if (!data) return;
    const base = visibleBase();
    for (const f of FILTERS) {
      const b = filterButtons.get(f.id);
      if (!b) continue;
      const count = base.filter((c) => matchesFilter(c, f.id)).length;
      b.textContent = `${f.label} (${count})`;
      b.setAttribute('aria-pressed', String(prefs.filter === f.id));
    }

    const items = sortByUrgency(base.filter((c) => matchesFilter(c, prefs.filter)));
    const fmt = { ...o.formatOptions(), includeOpen: true };
    listEl.replaceChildren();
    for (const c of items) {
      const li = el('li', 'atc-item');
      const link = el('a', 'atc-item-link', c.name);
      link.href = safeAssignmentHref(c, o.origin, o.courseId);
      const due = el('span', 'atc-item-due', formatDue(c, fmt));
      const top = el('div', 'atc-item-top');
      top.append(link, due);
      li.appendChild(top);
      const badges = renderBadgeGroup(c, fmt, o.themeClasses);
      if (badges) li.appendChild(badges);
      listEl.appendChild(li);
    }
    const filterLabel = FILTERS.find((f) => f.id === prefs.filter)?.label ?? '';
    empty.hidden = items.length > 0;
    empty.textContent = prefs.filter === 'not_full' ? 'Nothing below 100%. Nice work.' : `No assignments: ${filterLabel}.`;
    listEl.hidden = items.length === 0;
    if (announce) status.textContent = `Showing ${items.length} ${items.length === 1 ? 'assignment' : 'assignments'}: ${filterLabel}.`;
  }

  applyCollapsed();
  filters.hidden = true;

  return {
    root,
    setLoading() {
      root.setAttribute('aria-busy', 'true');
      headlineEl.textContent = 'Loading…';
      status.textContent = 'Loading assignments…';
    },
    setError(message: string) {
      root.removeAttribute('aria-busy');
      root.classList.add('atc-has-error');
      headlineEl.textContent = 'Could not load data';
      status.textContent = message;
    },
    setData(next: PanelData) {
      data = next;
      root.removeAttribute('aria-busy');
      root.classList.remove('atc-has-error');
      headlineEl.textContent = headline(next.summary);
      renderStats(next.summary);

      const unlisted = next.listedIds ? next.list.filter((c) => !next.listedIds?.has(c.id)).length : 0;
      scope.hidden = unlisted === 0;
      scopeBox.checked = prefs.onlyListed;
      scopeText.textContent = `Hide ${unlisted} not listed on this page (e.g. other grading periods)`;

      if (next.summary.noStudentData) {
        filters.hidden = true;
        listEl.hidden = true;
        empty.hidden = false;
        empty.textContent =
          'Canvas returned no submission data. This works for courses where you are enrolled as a student.';
        status.textContent = '';
      } else {
        filters.hidden = false;
        status.textContent = '';
        renderList(false);
      }
      const fmt = o.formatOptions();
      meta.textContent = `Updated ${formatDate(next.fetchedAt, fmt)} · Read-only · Not affiliated with Instructure`;
    },
  };
}
