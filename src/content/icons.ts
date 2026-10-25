import type { IconName } from '../core/format';

const SVG_NS = 'http://www.w3.org/2000/svg';

// 16×16 stroke icons, drawn for this project.
const PATHS: Record<IconName | 'chevron' | 'refresh', string> = {
  check: 'M3 8.5l3 3 7-7',
  alert: 'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM8 4.5v4.5M8 11.3v.2',
  clock: 'M8 1.5a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM8 4.5V8l2.5 1.5',
  lock: 'M3.5 7.5h9v6.5h-9zM5.5 7.5V5a2.5 2.5 0 0 1 5 0v2.5',
  hourglass: 'M4 2h8M4 14h8M5 2v1.5c0 2 6 2.5 6 4.5s-6 2.5-6 4.5V14M11 2v1.5c0 2-6 2.5-6 4.5s6 2.5 6 4.5V14',
  minus: 'M4 8h8',
  retry: 'M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3',
  calendar: 'M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
  chevron: 'M6 4l4 4-4 4',
  refresh: 'M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3',
};

export function icon(name: keyof typeof PATHS, className = 'atc-icon'): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.appendChild(path);
  return svg;
}
