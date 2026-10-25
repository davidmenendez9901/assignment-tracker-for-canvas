## What and why

<!-- Short description of the change. Link issues with "Fixes #123". -->

## Checklist

- [ ] `npm run check` passes
- [ ] Tests added/updated for logic changes
- [ ] Still read-only (GET only), same-origin only, no telemetry, no remote code
- [ ] No new permissions, or they are justified in `store/*/permissions.md` and `PRIVACY.md`
- [ ] No HTML strings inserted into the page; text via `textContent`
- [ ] Accessible: keyboard reachable, labelled, not color-only
