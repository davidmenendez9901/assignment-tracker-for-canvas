/**
 * Short-lived cache in the tab's sessionStorage so that moving between course
 * pages does not refetch everything. It only holds data Canvas already served
 * to this same page, and every access is guarded because storage can be
 * disabled or full.
 */

export type CacheStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const CACHE_TTL_MS = 2 * 60 * 1000;

interface Entry<T> {
  savedAt: number;
  data: T;
}

export function readCache<T>(
  storage: CacheStorage | null | undefined,
  key: string,
  now: number,
  ttlMs = CACHE_TTL_MS,
): Entry<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (typeof entry?.savedAt !== 'number' || now - entry.savedAt > ttlMs || now < entry.savedAt) {
      storage.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

export function writeCache<T>(storage: CacheStorage | null | undefined, key: string, data: T, now: number): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ savedAt: now, data } satisfies Entry<T>));
  } catch {
    // Quota exceeded or storage disabled: caching is optional.
  }
}
