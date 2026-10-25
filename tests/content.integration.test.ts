// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

const fixture = readFileSync(join(__dirname, 'fixtures/assignments-page.html'), 'utf8');

it('content script: fetches once (GET), renders the panel and inline badges', async () => {
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(
    'https://school.instructure.com/courses/42/assignments',
  );
  document.body.replaceChildren(new DOMParser().parseFromString(fixture, 'text/html').body.firstElementChild!);

  const past = new Date(Date.now() - 86_400_000).toISOString();
  const body = [
    { id: 101, name: 'Essay 1', points_possible: 100, grading_type: 'points', submission_types: ['online_upload'],
      submission: { score: 85, workflow_state: 'graded', submitted_at: past, posted_at: past } },
    { id: 5001, name: 'Quiz 1', quiz_id: 7, points_possible: 10, grading_type: 'points', due_at: past,
      submission_types: ['online_quiz'], submission: { score: null, workflow_state: 'unsubmitted' } },
  ];
  const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () =>
    new Response('while(1);' + JSON.stringify(body), { headers: { 'content-type': 'application/json' } }),
  );
  vi.stubGlobal('fetch', fetchMock);

  await import('../src/content/index');
  await vi.waitFor(() => {
    expect(document.querySelector('.atc-panel .atc-headline')?.textContent).toBe(
      '2 not at 100% · 1 overdue · 15 pts left',
    );
  });

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe(
    'https://school.instructure.com/api/v1/courses/42/assignments?include[]=submission&order_by=due_at&per_page=100',
  );
  expect(init.method).toBe('GET');

  // Panel sits right before the Canvas list; badges are on the matched rows.
  expect(document.querySelector('#ag-list')?.previousElementSibling?.classList.contains('atc-panel')).toBe(true);
  expect(document.querySelector('#assignment_101 .atc-badges')?.textContent).toContain('85/100 · 15 pts left');
  expect(document.querySelector('#assignment_102 .atc-badges')?.textContent).toContain('Overdue');

  // Rows re-rendered by Canvas get badges again.
  const row = document.querySelector('#assignment_101')!;
  const rerendered = row.cloneNode(true) as Element;
  rerendered.querySelector('.atc-badges')!.remove();
  row.replaceWith(rerendered);
  await vi.waitFor(() => {
    expect(document.querySelector('#assignment_101 .atc-badges')).not.toBeNull();
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
