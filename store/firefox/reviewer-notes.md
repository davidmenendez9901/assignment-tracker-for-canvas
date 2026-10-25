# Notes to AMO reviewers (draft)

**Build from source** (required because the submitted code is bundled with esbuild):

```sh
# Node.js 22.12+ and npm
npm ci
npm run build:firefox
# Output: dist/firefox (identical to the submitted package)
```

The source archive is produced by `npm run zip` as `release/assignment-tracker-source-<version>.zip`. Bundles are not minified.

**What it does:** On Canvas LMS course pages, reads `GET /api/v1/courses/:id/assignments?include[]=submission` from the same origin with the user's session, and renders badges and a summary panel. All DOM is built with `createElement`/`textContent`.

**Network:** Only same-origin GET requests to the Canvas site the user is on (`src/api/client.ts` enforces GET and same origin, including pagination links). No other network access; no remote code.

**Permissions:**
- `content_scripts` on `https://*.instructure.com/courses/*`: Canvas sites hosted by Instructure.
- `scripting`: registers the same content script for a custom Canvas origin after the user grants it in the options page.
- `activeTab`: popup reads the current tab URL to offer enabling the current site.
- `optional_host_permissions: https://*/*`: requested one origin at a time, at the user's request.

**Testing:** Requires a Canvas student account. Free Canvas accounts are available at https://canvas.instructure.com (self sign-up), or a course page on any `*.instructure.com` site.
