/**
 * Read-only Canvas API client.
 *
 * - GET only: there is deliberately no way to send another method.
 * - Same origin only: every URL (including pagination links) must resolve to
 *   the Canvas origin the page is on. Requests rely on the user's existing
 *   session cookie; no token is ever read or sent.
 */

export type ApiErrorKind = 'auth' | 'rate_limit' | 'http' | 'network' | 'parse' | 'origin';

export class CanvasApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CanvasApiError';
  }
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** The Canvas origin, e.g. "https://school.instructure.com". */
  origin: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Backoff delays for rate-limited responses; one retry per entry. */
  retryDelaysMs?: readonly number[];
  /** Hard stop for pagination. */
  maxPages?: number;
}

const JSON_PREFIX = /^\s*while\(1\);/;

/** Canvas may prefix JSON with "while(1);" to prevent JSON hijacking. */
export function stripJsonPrefix(text: string): string {
  return text.replace(JSON_PREFIX, '');
}

/** Returns the rel="next" URL from an RFC 8288 Link header, if any. */
export function parseNextLink(header: string | null | undefined): string | null {
  if (!header) return null;
  // Each link is "<url>; param=value; ...". Matching <...> first tolerates commas inside URLs.
  for (const match of header.matchAll(/<([^>]*)>([^<]*)/g)) {
    for (const param of (match[2] ?? '').split(';')) {
      const [name, value] = param.split('=').map((x) => x.trim());
      if (name?.toLowerCase() !== 'rel' || !value) continue;
      const rels = value.replace(/^"|"?,?$/g, '').toLowerCase().split(/\s+/);
      if (rels.includes('next')) return match[1] ?? null;
    }
  }
  return null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createClient(options: ClientOptions) {
  const origin = new URL(options.origin).origin;
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? defaultSleep;
  const retryDelays = options.retryDelaysMs ?? [1000, 3000];
  const maxPages = options.maxPages ?? 50;

  function resolveSameOrigin(pathOrUrl: string): string {
    let url: URL;
    try {
      url = new URL(pathOrUrl, origin);
    } catch {
      throw new CanvasApiError('origin', `Invalid URL: ${pathOrUrl}`);
    }
    if (url.origin !== origin) {
      throw new CanvasApiError('origin', `Refusing cross-origin request to ${url.origin}`);
    }
    return url.href;
  }

  async function isRateLimited(res: Response): Promise<boolean> {
    if (res.status === 429) return true;
    if (res.status !== 403) return false;
    const body = await res.clone().text().catch(() => '');
    return /rate limit exceeded/i.test(body);
  }

  async function getPage(pathOrUrl: string, signal?: AbortSignal): Promise<{ data: unknown; next: string | null }> {
    const url = resolveSameOrigin(pathOrUrl);
    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          redirect: 'follow',
          signal: signal ?? null,
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new CanvasApiError('network', 'Could not reach Canvas.');
      }

      if (await isRateLimited(res)) {
        const delay = retryDelays[attempt];
        if (delay === undefined) {
          throw new CanvasApiError('rate_limit', 'Canvas is rate limiting requests. Try again in a minute.', res.status);
        }
        await sleep(delay);
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new CanvasApiError('auth', 'Not authorized. Your Canvas session may have expired.', res.status);
      }
      if (!res.ok) {
        throw new CanvasApiError('http', `Canvas returned HTTP ${res.status}.`, res.status);
      }
      // A redirect to the login page comes back as 200 HTML.
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('json')) {
        throw new CanvasApiError('auth', 'Canvas did not return data. You may need to log in again.', res.status);
      }
      if (res.url && new URL(res.url).origin !== origin) {
        throw new CanvasApiError('origin', 'Canvas redirected to another site.');
      }

      let data: unknown;
      try {
        data = JSON.parse(stripJsonPrefix(await res.text()));
      } catch {
        throw new CanvasApiError('parse', 'Canvas returned data that could not be read.');
      }
      const nextRaw = parseNextLink(res.headers.get('link'));
      return { data, next: nextRaw ? resolveSameOrigin(nextRaw) : null };
    }
  }

  /** Fetches every page sequentially (never in parallel, to respect rate limits). */
  async function getAll<T>(path: string, signal?: AbortSignal): Promise<T[]> {
    const items: T[] = [];
    let next: string | null = path;
    for (let page = 0; next !== null; page++) {
      if (page >= maxPages) {
        throw new CanvasApiError('http', `Stopped after ${maxPages} pages.`);
      }
      const result: { data: unknown; next: string | null } = await getPage(next, signal);
      if (!Array.isArray(result.data)) {
        throw new CanvasApiError('parse', 'Expected a list from Canvas.');
      }
      items.push(...(result.data as T[]));
      next = result.next;
    }
    return items;
  }

  return { origin, getAll };
}

export type CanvasClient = ReturnType<typeof createClient>;
