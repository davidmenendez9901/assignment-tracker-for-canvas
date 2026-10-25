import { ext } from '../shared/browser';
import { isBuiltIn, normalizeOrigin, originPattern, reconcile } from '../shared/domains';

const form = document.getElementById('add-form') as HTMLFormElement;
const input = document.getElementById('origin') as HTMLInputElement;
const sites = document.getElementById('sites') as HTMLUListElement;
const noSites = document.getElementById('no-sites') as HTMLParagraphElement;
const status = document.getElementById('status') as HTMLParagraphElement;

function say(message: string): void {
  status.textContent = message;
}

async function refreshList(): Promise<void> {
  const granted = await reconcile(ext);
  sites.replaceChildren();
  for (const origin of granted) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.textContent = new URL(origin).host;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${new URL(origin).host}`);
    remove.addEventListener('click', () => {
      ext.permissions
        .remove({ origins: [originPattern(origin)] })
        .then(refreshList)
        .then(() => say(`Removed ${new URL(origin).host}.`))
        .catch(() => say('Could not remove that site.'));
    });
    li.append(name, remove);
    sites.appendChild(li);
  }
  noSites.hidden = granted.length > 0;
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const origin = normalizeOrigin(input.value);
  if (!origin) {
    say('Enter an https address such as https://canvas.myuniversity.edu');
    input.focus();
    return;
  }
  if (isBuiltIn(origin)) {
    say(`${new URL(origin).host} is already supported. No extra permission needed.`);
    return;
  }
  // permissions.request must be called synchronously inside the user gesture.
  ext.permissions
    .request({ origins: [originPattern(origin)] })
    .then(async (granted) => {
      if (!granted) {
        say('Permission was not granted.');
        return;
      }
      await refreshList();
      input.value = '';
      say(`Enabled on ${new URL(origin).host}. Reload any open Canvas tabs on that site.`);
    })
    .catch(() => say('Could not request permission for that address.'));
});

const prefill = new URLSearchParams(location.search).get('add');
if (prefill) {
  const origin = normalizeOrigin(prefill);
  if (origin) {
    input.value = origin;
    say(`Press “Allow” to enable the extension on ${new URL(origin).host}.`);
    input.focus();
  }
}

refreshList().catch(() => say('Could not read enabled sites.'));
