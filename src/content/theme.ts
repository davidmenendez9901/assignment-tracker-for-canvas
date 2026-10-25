/**
 * Canvas has no official dark mode, but users run high-contrast mode or
 * dark-theme extensions. Instead of guessing, measure the page background.
 */

export interface Theme {
  dark: boolean;
  highContrast: boolean;
}

export function parseRgb(value: string): [number, number, number, number] | null {
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)/.exec(value);
  if (!m) return null;
  let alpha = 1;
  if (m[4] !== undefined) alpha = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(r: number, g: number, b: number): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function detectTheme(doc: Document): Theme {
  let dark = false;
  for (const el of [doc.querySelector('#content'), doc.body, doc.documentElement]) {
    if (!el) continue;
    const rgb = parseRgb(getComputedStyle(el).backgroundColor);
    if (rgb && rgb[3] > 0.5) {
      dark = luminance(rgb[0], rgb[1], rgb[2]) < 0.2;
      break;
    }
  }
  // Canvas's "Use High Contrast UI" setting loads a separate stylesheet bundle.
  const highContrast = doc.querySelector('link[rel="stylesheet"][href*="high_contrast"]') !== null;
  return { dark, highContrast };
}

export function themeClasses(theme: Theme): string[] {
  const classes: string[] = [];
  if (theme.dark) classes.push('atc-dark');
  if (theme.highContrast) classes.push('atc-hc');
  return classes;
}
