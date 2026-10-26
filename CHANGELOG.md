# Changelog

## 0.1.0 (2026-10-26)

First version.

- Inline badges on Canvas course Assignments pages: score and points left, Due in N days, Overdue, Missing, Late, Closed, Not yet available, Pending grading, Grade not posted, Excused, No points, Retry available.
- Welcome page on install with an "as is, use at your own risk" notice and links to the Terms of Use and Privacy Policy.
- Collapsible summary panel with counts and filters (Not at 100%, Open, Overdue, Closed, Pending grading, All).
- Read-only, same-origin Canvas API client with pagination, `while(1);` prefix handling, rate-limit backoff, and a 2-minute per-tab cache.
- Works on `*.instructure.com`; custom Canvas addresses can be enabled per site from the popup or Options page.
- Dark page, high-contrast, and forced-colors support; screen-reader labels for every badge.
- Chrome (MV3) and Firefox (140+) builds.
