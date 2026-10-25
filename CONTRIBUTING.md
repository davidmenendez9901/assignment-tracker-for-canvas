# Contributing

Thanks for helping! Bug reports from real Canvas pages are especially valuable, since every school's Canvas can differ slightly.

## Ground rules (non-negotiable)

These protect students' privacy and are checked in review and partly by lint:

1. **Read-only.** Only `GET` requests, only through `src/api/client.ts`. Never submit, edit, or delete anything.
2. **Same origin only.** No requests to any domain other than the Canvas site the user is on. No analytics, telemetry, external CDNs, fonts, or remote code.
3. **No credentials.** Never ask for, read, or store passwords, tokens, or cookies.
4. **No HTML strings.** Build DOM with `createElement` and `textContent`. `innerHTML` and friends are banned by ESLint.
5. **Don't break Canvas.** Only append our own `atc-`-prefixed nodes; never move, remove, or restyle Canvas elements. Fail silently.
6. **No official branding.** Don't use Canvas or Instructure logos, names implying endorsement, or their brand colors.
7. **Minimal permissions.** New permissions need a strong reason and an update to `store/*/permissions.md` and `PRIVACY.md`.

## Setup

```sh
npm install
npm run watch        # rebuilds dist/chrome on change; reload the extension in chrome://extensions
npm run check        # typecheck + lint + tests + build (CI runs this)
```

## Where things live

- `src/core/classify.ts`: the rules for every status. Add a test in `tests/classify.test.ts` for any change.
- `src/core/format.ts`: badge text and screen-reader labels.
- `src/content/rows.ts`: how Canvas rows are matched (by link URL). If Canvas markup changes, start here and update `tests/fixtures/assignments-page.html`.
- `src/shared/domains.ts`: custom domain permissions and script registration.

## Reporting a Canvas compatibility problem

Use the "Canvas compatibility" issue template. Helpful details:

- Browser and version, extension version.
- Whether the summary panel appears, and whether row badges appear.
- **Sanitized** markup of one assignment row (right-click a row → Inspect → copy the `<li>` element). Remove your name, course names, and anything personal before posting.
- Never paste API responses containing grades or personal data.

## Pull requests

- Keep PRs focused; include tests for logic changes.
- Run `npm run check` before pushing.
- Write commit messages in English, in the imperative mood ("Add …", "Fix …").
- By contributing you agree your work is released under the MIT License.
