/**
 * Firefox exposes promise-based APIs on `browser`, Chrome MV3 on `chrome`.
 * Both have the same shape for everything this extension uses.
 */
export const ext: typeof chrome = (globalThis as { browser?: typeof chrome }).browser ?? chrome;
