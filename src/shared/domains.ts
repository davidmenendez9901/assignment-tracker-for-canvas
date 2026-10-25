/**
 * Custom Canvas domains (e.g. https://canvas.myuniversity.edu).
 *
 * The user grants host access to one origin at a time from the options page.
 * The granted permissions are the source of truth: for each granted origin a
 * content script is registered with scripting.registerContentScripts, and
 * reconcile() keeps the two in sync. No list is kept in storage.
 */

export const BUILT_IN_DOMAIN = '*.instructure.com';
const SCRIPT_PREFIX = 'atc-';

/** Accepts "canvas.uni.edu", "https://canvas.uni.edu/courses/1", etc. Returns an https origin or null. */
export function normalizeOrigin(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname;
  // Require a dotted hostname; reject wildcard-ish or empty input.
  if (!host || !host.includes('.') || host.includes('*')) return null;
  return url.origin;
}

export function isBuiltIn(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'instructure.com' || host.endsWith('.instructure.com');
  } catch {
    return false;
  }
}

export function originPattern(origin: string): string {
  return `${origin}/*`;
}

export function scriptId(origin: string): string {
  return SCRIPT_PREFIX + new URL(origin).host;
}

export function contentScriptMatches(origin: string): string[] {
  return [`${origin}/courses/*`];
}

/** Custom origins from a permissions object: concrete "https://host/*" patterns only. */
export function grantedCustomOrigins(origins: readonly string[] | undefined): string[] {
  const result = new Set<string>();
  for (const pattern of origins ?? []) {
    const m = /^https:\/\/([^/*]+)\/\*$/.exec(pattern);
    if (!m) continue;
    const origin = `https://${m[1]}`;
    if (!isBuiltIn(origin)) result.add(origin);
  }
  return [...result].sort();
}

/** The subset of the extension API reconcile() needs, so it can be tested. */
export interface DomainApi {
  permissions: { getAll(): Promise<{ origins?: string[] }> };
  scripting: {
    getRegisteredContentScripts(): Promise<Array<{ id: string }>>;
    registerContentScripts(scripts: chrome.scripting.RegisteredContentScript[]): Promise<void>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
  };
}

function scriptFor(origin: string, persist: boolean): chrome.scripting.RegisteredContentScript {
  return {
    id: scriptId(origin),
    matches: contentScriptMatches(origin),
    js: ['content.js'],
    css: ['content.css'],
    runAt: 'document_idle',
    ...(persist ? { persistAcrossSessions: true } : {}),
  };
}

/** Registers scripts for granted origins and removes scripts whose permission is gone. */
export async function reconcile(api: DomainApi): Promise<string[]> {
  const granted = grantedCustomOrigins((await api.permissions.getAll()).origins);
  const wanted = new Map(granted.map((o) => [scriptId(o), o]));
  const registered = (await api.scripting.getRegisteredContentScripts())
    .map((s) => s.id)
    .filter((id) => id.startsWith(SCRIPT_PREFIX));

  const stale = registered.filter((id) => !wanted.has(id));
  if (stale.length) await api.scripting.unregisterContentScripts({ ids: stale });

  for (const [id, origin] of wanted) {
    if (registered.includes(id)) continue;
    try {
      await api.scripting.registerContentScripts([scriptFor(origin, true)]);
    } catch (err) {
      if (/duplicate/i.test(String(err))) continue; // Registered concurrently.
      // Older engines may not support persistAcrossSessions; startup reconcile covers persistence.
      await api.scripting.registerContentScripts([scriptFor(origin, false)]).catch(() => {});
    }
  }
  return granted;
}
