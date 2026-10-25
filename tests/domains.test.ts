import { describe, expect, it, vi } from 'vitest';
import {
  contentScriptMatches,
  grantedCustomOrigins,
  isBuiltIn,
  normalizeOrigin,
  reconcile,
  scriptId,
  type DomainApi,
} from '../src/shared/domains';

describe('normalizeOrigin', () => {
  it.each([
    ['canvas.myuni.edu', 'https://canvas.myuni.edu'],
    ['https://canvas.myuni.edu/courses/1/assignments', 'https://canvas.myuni.edu'],
    ['  HTTPS://Canvas.MyUni.edu  ', 'https://canvas.myuni.edu'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeOrigin(input)).toBe(expected);
  });

  it.each(['', 'http://canvas.myuni.edu', 'localhost', 'ftp://x.edu', 'https://*.edu', 'https://u:p@x.edu', 'https://x.edu:8443', 'not a url'])(
    'rejects %j',
    (input) => {
      expect(normalizeOrigin(input)).toBeNull();
    },
  );
});

describe('helpers', () => {
  it('recognizes built-in instructure.com hosts', () => {
    expect(isBuiltIn('https://school.instructure.com')).toBe(true);
    expect(isBuiltIn('https://instructure.com.evil.example')).toBe(false);
    expect(isBuiltIn('https://canvas.myuni.edu')).toBe(false);
  });

  it('builds script ids and course-only match patterns', () => {
    expect(scriptId('https://canvas.myuni.edu')).toBe('atc-canvas.myuni.edu');
    expect(contentScriptMatches('https://canvas.myuni.edu')).toEqual(['https://canvas.myuni.edu/courses/*']);
  });

  it('extracts only concrete custom origins from granted permissions', () => {
    expect(
      grantedCustomOrigins([
        'https://*.instructure.com/*',
        'https://*.instructure.com/courses/*',
        'https://school.instructure.com/*',
        'https://canvas.myuni.edu/*',
        'https://*/*',
        'https://b.edu/*',
      ]),
    ).toEqual(['https://b.edu', 'https://canvas.myuni.edu']);
    expect(grantedCustomOrigins(undefined)).toEqual([]);
  });
});

describe('reconcile', () => {
  function fakeApi(origins: string[], registeredIds: string[]) {
    const registered = new Set(registeredIds);
    const api = {
      permissions: { getAll: vi.fn(async () => ({ origins })) },
      scripting: {
        getRegisteredContentScripts: vi.fn(async () => [...registered].map((id) => ({ id }))),
        registerContentScripts: vi.fn(async (scripts: chrome.scripting.RegisteredContentScript[]) => {
          for (const s of scripts) registered.add(s.id);
        }),
        unregisterContentScripts: vi.fn(async ({ ids }: { ids: string[] }) => {
          for (const id of ids) registered.delete(id);
        }),
      },
    } satisfies DomainApi;
    return { api, registered };
  }

  it('registers new origins and removes revoked ones', async () => {
    const { api, registered } = fakeApi(['https://a.edu/*', 'https://*.instructure.com/courses/*'], ['atc-old.edu', 'other-id']);
    const granted = await reconcile(api);
    expect(granted).toEqual(['https://a.edu']);
    expect([...registered].sort()).toEqual(['atc-a.edu', 'other-id']);
    const script = api.scripting.registerContentScripts.mock.calls[0]![0][0]!;
    expect(script.matches).toEqual(['https://a.edu/courses/*']);
    expect(script.js).toEqual(['content.js']);
    expect(script.css).toEqual(['content.css']);
  });

  it('does nothing when already in sync', async () => {
    const { api } = fakeApi(['https://a.edu/*'], ['atc-a.edu']);
    await reconcile(api);
    expect(api.scripting.registerContentScripts).not.toHaveBeenCalled();
    expect(api.scripting.unregisterContentScripts).not.toHaveBeenCalled();
  });

  it('retries without persistAcrossSessions if the engine rejects it', async () => {
    const { api } = fakeApi(['https://a.edu/*'], []);
    api.scripting.registerContentScripts.mockRejectedValueOnce(new Error('Unexpected property "persistAcrossSessions"'));
    await reconcile(api);
    expect(api.scripting.registerContentScripts).toHaveBeenCalledTimes(2);
    expect(api.scripting.registerContentScripts.mock.calls[1]![0][0]!.persistAcrossSessions).toBeUndefined();
  });
});
