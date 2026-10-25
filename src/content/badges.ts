import type { Classification } from '../core/classify';
import { ariaSummary, badgeParts, badgeSignature, type FormatOptions } from '../core/format';
import { icon } from './icons';
import type { RowMatch } from './rows';

const BADGES_CLASS = 'atc-badges';

/**
 * Builds a badge group. The visible pills are hidden from assistive technology
 * and a single visually-hidden sentence is read instead, so screen readers get
 * "Score 85 out of 100, 15 points below full score" rather than "85 slash 100 dot".
 */
export function renderBadgeGroup(
  c: Classification,
  opts: FormatOptions,
  themeClasses: readonly string[],
): HTMLElement | null {
  const parts = badgeParts(c, opts);
  if (parts.length === 0) return null;

  const group = document.createElement('span');
  group.className = ['atc-root', BADGES_CLASS, ...themeClasses].join(' ');
  group.dataset.atcId = c.id;
  group.dataset.atcSig = badgeSignature(c, opts);

  const sr = document.createElement('span');
  sr.className = 'atc-sr-only';
  sr.textContent = `${ariaSummary(c, opts)}.`;
  group.appendChild(sr);

  for (const part of parts) {
    const pill = document.createElement('span');
    pill.className = `atc-badge atc-tone-${part.tone}${part.subtle ? ' atc-subtle' : ''}`;
    pill.setAttribute('aria-hidden', 'true');
    pill.title = part.label;
    pill.appendChild(icon(part.icon));
    const text = document.createElement('span');
    text.textContent = part.text;
    pill.appendChild(text);
    group.appendChild(pill);
  }
  return group;
}

/**
 * Adds or updates badges on matched rows. Idempotent: a row whose badge
 * already matches the current state is left untouched, so this can run on
 * every DOM mutation without causing further mutations.
 */
export function decorateRows(rows: readonly RowMatch[], opts: FormatOptions, themeClasses: readonly string[]): number {
  let changed = 0;
  for (const { host, classification: c } of rows) {
    const existing = host.querySelector<HTMLElement>(`:scope > .${BADGES_CLASS}`);
    const sig = badgeSignature(c, opts);
    if (existing && existing.dataset.atcId === c.id && existing.dataset.atcSig === sig) continue;
    existing?.remove();
    const group = renderBadgeGroup(c, opts, themeClasses);
    if (group) host.appendChild(group);
    changed++;
  }
  return changed;
}
