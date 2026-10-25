import { ext } from '../shared/browser';
import { isBuiltIn, normalizeOrigin, originPattern } from '../shared/domains';

const status = document.getElementById('status') as HTMLParagraphElement;
const enable = document.getElementById('enable') as HTMLButtonElement;
const manage = document.getElementById('manage') as HTMLAnchorElement;

function openOptions(origin?: string): void {
  const page = ext.runtime.getURL('options/options.html');
  // The permission prompt is shown from the options page because Firefox
  // closes popups when a permission prompt opens.
  void ext.tabs.create({ url: origin ? `${page}?add=${encodeURIComponent(origin)}` : page });
  window.close();
}

manage.addEventListener('click', (e) => {
  e.preventDefault();
  openOptions();
});

async function init(): Promise<void> {
  // activeTab grants access to the current tab's URL while the popup is open.
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  const origin = tab?.url ? normalizeOrigin(tab.url) : null;
  if (!origin) {
    status.textContent = 'Open a Canvas course’s Assignments page to see your scores and deadlines.';
    return;
  }
  const host = new URL(origin).host;
  if (isBuiltIn(origin)) {
    status.textContent = `Active on ${host}. Open a course’s Assignments page.`;
    return;
  }
  if (await ext.permissions.contains({ origins: [originPattern(origin)] })) {
    status.textContent = `Enabled on ${host}. Open a course’s Assignments page.`;
    return;
  }
  status.textContent = `Not enabled on ${host}. If this is your school’s Canvas, you can enable it.`;
  enable.hidden = false;
  enable.addEventListener('click', () => openOptions(origin));
}

init().catch(() => {
  status.textContent = 'Could not read the current tab.';
});
