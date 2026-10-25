import { describe, expect, it, vi } from 'vitest';
import { CanvasApiError, createClient, parseNextLink, stripJsonPrefix, type FetchLike } from '../src/api/client';
import { assignmentsPath, loadAssignments, slimAssignment } from '../src/api/assignments';
import { readCache, writeCache } from '../src/api/cache';

const ORIGIN = 'https://school.instructure.com';

function json(body: unknown, init: { status?: number; link?: string; prefix?: boolean; url?: string } = {}): Response {
  const text = (init.prefix ? 'while(1);' : '') + JSON.stringify(body);
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  if (init.link) headers.set('link', init.link);
  const res = new Response(text, { status: init.status ?? 200, headers });
  if (init.url) Object.defineProperty(res, 'url', { value: init.url });
  return res;
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

describe('stripJsonPrefix', () => {
  it('removes while(1); and leaves normal JSON alone', () => {
    expect(stripJsonPrefix('while(1);[1]')).toBe('[1]');
    expect(stripJsonPrefix('  while(1);{"a":1}')).toBe('{"a":1}');
    expect(stripJsonPrefix('[1]')).toBe('[1]');
  });
});

describe('parseNextLink', () => {
  it('finds rel="next" among several links', () => {
    const header =
      '<https://x.instructure.com/api/v1/courses/1/assignments?page=1&per_page=100>; rel="current",' +
      '<https://x.instructure.com/api/v1/courses/1/assignments?page=2&per_page=100>; rel="next",' +
      '<https://x.instructure.com/api/v1/courses/1/assignments?page=1&per_page=100>; rel="first"';
    expect(parseNextLink(header)).toBe('https://x.instructure.com/api/v1/courses/1/assignments?page=2&per_page=100');
  });

  it('handles unquoted rel, multiple rel values, and absence', () => {
    expect(parseNextLink('</a?page=2>; rel=next')).toBe('/a?page=2');
    expect(parseNextLink('</a?page=2>; rel="prev next"')).toBe('/a?page=2');
    expect(parseNextLink('</a?page=1>; rel="first", </a?page=3>; rel="last"')).toBeNull();
    expect(parseNextLink(null)).toBeNull();
    expect(parseNextLink('')).toBeNull();
  });

  it('tolerates commas inside URLs', () => {
    expect(parseNextLink('</a?ids=1,2&page=2>; rel="next"')).toBe('/a?ids=1,2&page=2');
  });
});

describe('client.getAll', () => {
  it('follows pagination sequentially and only sends GET with same-origin credentials', async () => {
    const fetchImpl = vi.fn<FetchLike>(async (url) => {
      if (url.endsWith('page=2')) return json([{ id: 3 }]);
      return json([{ id: 1 }, { id: 2 }], { link: `<${ORIGIN}/api/v1/x?page=2>; rel="next"`, prefix: true });
    });
    const client = createClient({ origin: ORIGIN, fetchImpl });
    const items = await client.getAll<{ id: number }>('/api/v1/x');
    expect(items.map((i) => i.id)).toEqual([1, 2, 3]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init.method).toBe('GET');
      expect(init.credentials).toBe('same-origin');
      expect(init.body).toBeUndefined();
    }
  });

  it('refuses cross-origin pagination links', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => json([], { link: '<https://evil.example/api>; rel="next"' }));
    const client = createClient({ origin: ORIGIN, fetchImpl });
    await expect(client.getAll('/api/v1/x')).rejects.toMatchObject({ kind: 'origin' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses cross-origin initial URLs without fetching', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const client = createClient({ origin: ORIGIN, fetchImpl });
    await expect(client.getAll('https://evil.example/api/v1/x')).rejects.toBeInstanceOf(CanvasApiError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('retries on rate limiting with backoff, then gives up', async () => {
    const sleep = vi.fn(async () => {});
    const fetchImpl = vi.fn<FetchLike>(async () => new Response('403 Forbidden (Rate Limit Exceeded)', { status: 403 }));
    const client = createClient({ origin: ORIGIN, fetchImpl, sleep, retryDelaysMs: [10, 20] });
    await expect(client.getAll('/api/v1/x')).rejects.toMatchObject({ kind: 'rate_limit' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[10], [20]]);
  });

  it('recovers after a 429', async () => {
    let calls = 0;
    const fetchImpl = vi.fn<FetchLike>(async () => (calls++ === 0 ? new Response('', { status: 429 }) : json([{ id: 1 }])));
    const client = createClient({ origin: ORIGIN, fetchImpl, sleep: async () => {} });
    expect(await client.getAll('/api/v1/x')).toEqual([{ id: 1 }]);
  });

  it('maps 401, plain 403, and HTML login pages to auth errors', async () => {
    for (const res of [
      new Response('{}', { status: 401 }),
      new Response('forbidden', { status: 403 }),
      new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
    ]) {
      const client = createClient({ origin: ORIGIN, fetchImpl: async () => res });
      await expect(client.getAll('/api/v1/x')).rejects.toMatchObject({ kind: 'auth' });
    }
  });

  it('maps other failures', async () => {
    const http = createClient({ origin: ORIGIN, fetchImpl: async () => new Response('', { status: 500 }) });
    await expect(http.getAll('/x')).rejects.toMatchObject({ kind: 'http', status: 500 });

    const network = createClient({
      origin: ORIGIN,
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch');
      },
    });
    await expect(network.getAll('/x')).rejects.toMatchObject({ kind: 'network' });

    const parse = createClient({
      origin: ORIGIN,
      fetchImpl: async () => new Response('{nope', { headers: { 'content-type': 'application/json' } }),
    });
    await expect(parse.getAll('/x')).rejects.toMatchObject({ kind: 'parse' });

    const notList = createClient({ origin: ORIGIN, fetchImpl: async () => json({ errors: [] }) });
    await expect(notList.getAll('/x')).rejects.toMatchObject({ kind: 'parse' });
  });

  it('stops after maxPages', async () => {
    const fetchImpl: FetchLike = async () => json([{ id: 1 }], { link: `<${ORIGIN}/x?again>; rel="next"` });
    const client = createClient({ origin: ORIGIN, fetchImpl, maxPages: 3 });
    await expect(client.getAll('/x')).rejects.toMatchObject({ kind: 'http' });
  });

  it('rejects responses redirected to another origin', async () => {
    const client = createClient({
      origin: ORIGIN,
      fetchImpl: async () => json([], { url: 'https://sso.example.edu/login' }),
    });
    await expect(client.getAll('/x')).rejects.toMatchObject({ kind: 'origin' });
  });
});

describe('cache', () => {
  it('expires after the TTL and ignores corrupt entries', () => {
    const storage = memoryStorage();
    writeCache(storage, 'k', [1], 1000);
    expect(readCache(storage, 'k', 1000 + 1000, 5000)?.data).toEqual([1]);
    expect(readCache(storage, 'k', 1000 + 6000, 5000)).toBeNull();
    storage.setItem('bad', '{not json');
    expect(readCache(storage, 'bad', 0)).toBeNull();
    expect(readCache(null, 'k', 0)).toBeNull();
  });

  it('swallows storage errors', () => {
    const throwing = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {},
    };
    expect(() => writeCache(throwing, 'k', 1, 0)).not.toThrow();
    expect(readCache(throwing, 'k', 0)).toBeNull();
  });
});

describe('loadAssignments', () => {
  it('requests submissions, slims data, caches, and reuses the cache', async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      json([{ id: 1, name: 'A', description: '<p>huge</p>', points_possible: 10, submission: { score: 5, extra: 1 } }]),
    );
    const client = createClient({ origin: ORIGIN, fetchImpl });
    const storage = memoryStorage();
    const first = await loadAssignments(client, '7', { storage, now: () => 1000 });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`${ORIGIN}${assignmentsPath('7')}`);
    expect(first.fromCache).toBe(false);
    expect(JSON.stringify(first.assignments)).not.toContain('huge');
    expect(first.assignments[0]?.submission?.score).toBe(5);

    const second = await loadAssignments(client, '7', { storage, now: () => 2000 });
    expect(second.fromCache).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await loadAssignments(client, '7', { storage, now: () => 3000, bypassCache: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('slimAssignment keeps module names and drops unknown fields', () => {
    const slim = slimAssignment({
      id: 1,
      lock_info: { context_module: { id: 3, name: 'Week 1' }, asset_string: 'assignment_1' },
      submission: null,
    });
    expect(slim.lock_info?.context_module?.name).toBe('Week 1');
    expect(slim.submission).toBeNull();
  });
});
