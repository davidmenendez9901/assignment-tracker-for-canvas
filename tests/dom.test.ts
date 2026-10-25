// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyAll } from '../src/core/classify';
import { summarize } from '../src/core/summarize';
import { decorateRows, renderBadgeGroup } from '../src/content/badges';
import { createPanel, headline, safeAssignmentHref } from '../src/content/panel';
import { DEFAULT_PREFS, loadPrefs } from '../src/content/prefs';
import { isCanvasPage, parseRoute } from '../src/content/route';
import { buildIndex, findRows, LIST_ROOT_SELECTOR } from '../src/content/rows';
import { luminance, parseRgb } from '../src/content/theme';
import { assignment, graded, NOW, PAST, submission } from './helpers';

const ORIGIN = 'https://school.instructure.com';
const fixture = readFileSync(join(__dirname, 'fixtures/assignments-page.html'), 'utf8');
const fmt = { now: NOW, locale: 'en-US', timeZone: 'UTC' };

const list = classifyAll(
  [
    assignment({ id: 101, name: 'Essay 1' }, graded(85)),
    assignment({ id: 5001, name: 'Quiz 1', quiz_id: 7, due_at: PAST }),
    assignment({ id: 5002, name: 'Discussion 1', discussion_topic: { id: 9 } }, graded(10, { excused: false })),
    assignment({ id: 5003, name: 'Not on page', due_at: PAST }, submission({ missing: true })),
  ],
  NOW,
);

function loadFixture(): void {
  // Test-only: load a static, trusted fixture. Production code never parses HTML.
  document.body.replaceChildren(new DOMParser().parseFromString(fixture, 'text/html').body.firstElementChild!);
}

describe('route', () => {
  it('recognizes assignments and course home pages', () => {
    expect(parseRoute('/courses/42/assignments')).toEqual({ courseId: '42', page: 'assignments' });
    expect(parseRoute('/courses/42/assignments/')).toEqual({ courseId: '42', page: 'assignments' });
    expect(parseRoute('/courses/42')).toEqual({ courseId: '42', page: 'course_home' });
    expect(parseRoute('/courses/1~42/assignments')).toEqual({ courseId: '1~42', page: 'assignments' });
  });

  it('ignores other pages', () => {
    expect(parseRoute('/courses/42/assignments/101')).toBeNull();
    expect(parseRoute('/courses/42/grades')).toBeNull();
    expect(parseRoute('/')).toBeNull();
  });

  it('detects Canvas', () => {
    loadFixture();
    expect(isCanvasPage(document)).toBe(true);
    document.body.replaceChildren();
    expect(isCanvasPage(document)).toBe(false);
  });
});

describe('row matching and badges', () => {
  beforeEach(loadFixture);

  it('matches assignment, classic quiz and discussion links in this course only', () => {
    const rows = findRows(document.querySelector(LIST_ROOT_SELECTOR)!, buildIndex(list), {
      origin: ORIGIN,
      courseId: '42',
    });
    expect(rows.map((r) => r.classification.name)).toEqual(['Essay 1', 'Quiz 1', 'Discussion 1']);
    expect(rows.every((r) => r.host.classList.contains('ig-info'))).toBe(true);
  });

  it('adds badges once, is idempotent, and updates on change', () => {
    const root = document.querySelector(LIST_ROOT_SELECTOR)!;
    const ctx = { origin: ORIGIN, courseId: '42' };
    const rows = findRows(root, buildIndex(list), ctx);
    expect(decorateRows(rows, fmt, [])).toBe(3);
    expect(decorateRows(rows, fmt, [])).toBe(0);
    expect(document.querySelectorAll('.atc-badges')).toHaveLength(3);

    const essay = document.querySelector('#assignment_101 .atc-badges')!;
    expect(essay.textContent).toContain('85/100 · 15 pts left');
    expect(essay.querySelector('.atc-sr-only')?.textContent).toContain('Score 85 out of 100');
    expect(essay.querySelectorAll('.atc-badge[aria-hidden="true"] svg[aria-hidden="true"]').length).toBeGreaterThan(0);

    const updated = classifyAll([assignment({ id: 101, name: 'Essay 1' }, graded(100))], NOW);
    decorateRows(findRows(root, buildIndex(updated), ctx), fmt, []);
    expect(document.querySelectorAll('#assignment_101 .atc-badges')).toHaveLength(1);
    expect(document.querySelector('#assignment_101 .atc-badges')!.textContent).toContain('100/100');
  });

  it('never matches links inside our own nodes', () => {
    const root = document.querySelector(LIST_ROOT_SELECTOR)!;
    const ctx = { origin: ORIGIN, courseId: '42' };
    decorateRows(findRows(root, buildIndex(list), ctx), fmt, []);
    const own = document.createElement('div');
    own.className = 'atc-root';
    const link = document.createElement('a');
    link.href = '/courses/42/assignments/101';
    own.appendChild(link);
    root.appendChild(own);
    expect(findRows(root, buildIndex(list), ctx)).toHaveLength(3);
  });

  it('treats API text as text, never markup', () => {
    const [c] = classifyAll([assignment({ name: '<img src=x onerror=alert(1)>' }, graded(5))], NOW);
    const group = renderBadgeGroup(c!, fmt, [])!;
    expect(group.querySelector('img')).toBeNull();
  });
});

describe('panel', () => {
  function makePanel(onRefresh = vi.fn()) {
    const panel = createPanel({
      origin: ORIGIN,
      courseId: '42',
      prefs: { ...DEFAULT_PREFS },
      themeClasses: [],
      formatOptions: () => fmt,
      onPrefsChange: () => {},
      onRefresh,
    });
    document.body.appendChild(panel.root);
    return panel;
  }

  it('renders an accessible disclosure with filters and a list', () => {
    const panel = makePanel();
    panel.setData({ list, summary: summarize(list), fetchedAt: NOW, listedIds: new Set(['101', '5001', '5002']) });
    const toggle = panel.root.querySelector<HTMLButtonElement>('.atc-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe('atc-body');

    const pressed = panel.root.querySelectorAll('.atc-filter[aria-pressed="true"]');
    expect(pressed).toHaveLength(1);
    expect(pressed[0]!.textContent).toMatch(/^Not at 100%/);

    const names = [...panel.root.querySelectorAll('.atc-item-link')].map((a) => a.textContent);
    expect(names).toContain('Essay 1');
    expect(names).toContain('Not on page');

    toggle.click();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel.root.querySelector<HTMLElement>('.atc-body')!.hidden).toBe(true);
  });

  it('switches filters and announces the result', () => {
    const panel = makePanel();
    panel.setData({ list, summary: summarize(list), fetchedAt: NOW, listedIds: null });
    panel.root.querySelector<HTMLButtonElement>('.atc-filter[data-filter="overdue"]')!.click();
    const names = [...panel.root.querySelectorAll('.atc-item-link')].map((a) => a.textContent);
    expect(names.sort()).toEqual(['Not on page', 'Quiz 1']);
    expect(panel.root.querySelector('[role="status"]')!.textContent).toBe('Showing 2 assignments: Overdue.');
  });

  it('can hide assignments that are not listed on the page', () => {
    const panel = makePanel();
    panel.setData({ list, summary: summarize(list), fetchedAt: NOW, listedIds: new Set(['101', '5001', '5002']) });
    const box = panel.root.querySelector<HTMLInputElement>('.atc-scope input')!;
    expect(panel.root.querySelector<HTMLElement>('.atc-scope')!.hidden).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    const names = [...panel.root.querySelectorAll('.atc-item-link')].map((a) => a.textContent);
    expect(names).not.toContain('Not on page');
  });

  it('shows errors without throwing', () => {
    const panel = makePanel();
    panel.setLoading();
    expect(panel.root.getAttribute('aria-busy')).toBe('true');
    panel.setError('Not authorized.');
    expect(panel.root.querySelector('[role="status"]')!.textContent).toBe('Not authorized.');
    expect(panel.root.classList.contains('atc-has-error')).toBe(true);
  });

  it('throttles refresh clicks', () => {
    const onRefresh = vi.fn();
    const panel = makePanel(onRefresh);
    const button = panel.root.querySelector<HTMLButtonElement>('.atc-refresh')!;
    button.click();
    button.click();
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('explains the non-student case', () => {
    const teacherView = classifyAll([assignment({}, null)], NOW);
    const panel = makePanel();
    panel.setData({ list: teacherView, summary: summarize(teacherView), fetchedAt: NOW, listedIds: null });
    expect(panel.root.querySelector('.atc-empty')!.textContent).toMatch(/enrolled as a student/);
    expect(headline(summarize(teacherView))).toBe('No student grades for your role');
  });
});

describe('helpers', () => {
  it('only uses same-origin http(s) assignment links', () => {
    const [c] = classifyAll([assignment({ id: 5, html_url: 'javascript:alert(1)' })], NOW);
    expect(safeAssignmentHref(c!, ORIGIN, '42')).toBe(`${ORIGIN}/courses/42/assignments/5`);
    const [d] = classifyAll([assignment({ id: 6, html_url: 'https://evil.example/x' })], NOW);
    expect(safeAssignmentHref(d!, ORIGIN, '42')).toBe(`${ORIGIN}/courses/42/assignments/6`);
    const [e] = classifyAll([assignment({ id: 7, html_url: `${ORIGIN}/courses/42/assignments/7` })], NOW);
    expect(safeAssignmentHref(e!, ORIGIN, '42')).toBe(`${ORIGIN}/courses/42/assignments/7`);
  });

  it('parses colors and luminance', () => {
    expect(parseRgb('rgb(255, 255, 255)')).toEqual([255, 255, 255, 1]);
    expect(parseRgb('rgba(0, 0, 0, 0)')).toEqual([0, 0, 0, 0]);
    expect(parseRgb('rgb(10 20 30 / 50%)')).toEqual([10, 20, 30, 0.5]);
    expect(parseRgb('transparent')).toBeNull();
    expect(luminance(255, 255, 255)).toBeCloseTo(1);
    expect(luminance(0, 0, 0)).toBe(0);
  });

  it('falls back to default prefs on bad storage data', () => {
    expect(loadPrefs({ getItem: () => '{"filter":"bogus","collapsed":"yes"}' })).toEqual(DEFAULT_PREFS);
    expect(loadPrefs(null)).toEqual(DEFAULT_PREFS);
  });
});
