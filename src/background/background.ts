/**
 * Keeps dynamically registered content scripts in sync with the custom Canvas
 * domains the user has granted. Makes no network requests.
 */
import { ext } from '../shared/browser';
import { reconcile } from '../shared/domains';

function sync(): void {
  reconcile(ext).catch(() => {
    // Nothing to report to; the options page re-runs reconcile when opened.
  });
}

ext.runtime.onInstalled.addListener(sync);
ext.runtime.onStartup.addListener(sync);
ext.permissions.onAdded.addListener(sync);
ext.permissions.onRemoved.addListener(sync);
