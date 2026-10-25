# Chrome Web Store: privacy practices tab (draft)

## Single purpose

Shows students the score, points remaining, and availability status (open, closed, overdue, etc.) of their assignments on Canvas LMS course pages.

## Permission justifications

**Host access via content script `https://*.instructure.com/courses/*`**
Canvas LMS sites hosted by Instructure use this domain. The content script runs only on course pages to add status badges and a summary panel, and reads the course's assignments from that same site's API with the user's existing session.

**`scripting`**
Used only to register the same content script on a custom Canvas address (for example canvas.myuniversity.edu) after the user explicitly grants access to that one site from the options page. Many schools host Canvas on their own domain, which cannot be known at install time.

**`activeTab`**
Lets the toolbar popup read the current tab's address when the user clicks the icon, so it can say whether the extension is active there and offer to enable it on a custom Canvas address. No other tab data is accessed.

**Optional host permission `https://*/*`**
Never requested as a whole. When the user enters their school's Canvas address, the extension requests access to that single origin only (e.g. `https://canvas.myuniversity.edu/*`). Users can revoke it at any time from the options page.

**Remote code:** No. All code is bundled in the package; no external scripts, CDNs, or eval.

## Data usage disclosures

Data types collected: **none**. Tick nothing in the "collected data" list.

The extension processes the user's assignment and grade data locally in the browser to render badges. It is not collected, transmitted to the developer or any third party, sold, or used for any purpose other than the single purpose above.

Certify:
- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** https://davidmenendez9901.github.io/assignment-tracker-for-canvas/privacy.html
