# Privacy Policy

_Assignment Tracker for Canvas. Last updated: October 24, 2026._

**This extension does not collect, store, sell, or transmit any personal data. Nothing leaves your browser.**

## What it reads

When you open a Canvas course page, the extension asks that same Canvas site for the course's assignments and your own submission status (scores, due dates, availability). It does this with read-only (GET) requests to that site's API, using the login session you already have in the browser.

## Where data goes

Nowhere. The data is processed inside your browser to draw badges and the summary panel.

- No requests to any server other than the Canvas site you are on.
- No analytics, telemetry, crash reporting, advertising, or tracking.
- No remote code, fonts, or content delivery networks.
- No passwords, API tokens, or cookies are read or stored by the extension.

## What is stored on your device

- A short-lived copy (about 2 minutes) of the assignment data, in the browser tab's session storage for that Canvas site, so moving between pages doesn't refetch everything. It is cleared when the tab is closed.
- Your panel preferences (collapsed or expanded, selected filter) in that Canvas site's local storage.
- If you add a custom Canvas address, your browser remembers that permission. You can remove it from the Options page or your browser's extension settings.

## Permissions

| Permission | Why |
|---|---|
| Access to `*.instructure.com` course pages | To show badges on Canvas course pages hosted by Instructure. |
| Optional access to a site you add | Only if you choose to enable a custom Canvas address. |
| `scripting` | To run on a custom Canvas address after you allow it. |
| `activeTab` | So the toolbar popup can see which site you are on and offer to enable it. |

## Contact

Questions or concerns: open an issue at https://github.com/davidmenendez9901/assignment-tracker-for-canvas/issues

_Not affiliated with, endorsed by, or sponsored by Instructure, Inc. Canvas is a trademark of Instructure, Inc._
