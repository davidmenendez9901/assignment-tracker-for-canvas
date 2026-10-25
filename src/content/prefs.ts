import { isFilterId, type FilterId } from '../core/summarize';

/** Per-viewer UI conveniences. Losing them is harmless. */
export interface Prefs {
  collapsed: boolean;
  filter: FilterId;
  onlyListed: boolean;
}

const KEY = 'atc:prefs:v1';
export const DEFAULT_PREFS: Prefs = { collapsed: false, filter: 'not_full', onlyListed: false };

export function loadPrefs(storage: Pick<Storage, 'getItem'> | null): Prefs {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      collapsed: typeof p.collapsed === 'boolean' ? p.collapsed : DEFAULT_PREFS.collapsed,
      filter: isFilterId(p.filter) ? p.filter : DEFAULT_PREFS.filter,
      onlyListed: typeof p.onlyListed === 'boolean' ? p.onlyListed : DEFAULT_PREFS.onlyListed,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(storage: Pick<Storage, 'setItem'> | null, prefs: Prefs): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Storage disabled.
  }
}
