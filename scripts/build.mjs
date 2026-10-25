// Builds dist/chrome and dist/firefox.
// Usage: node scripts/build.mjs [chrome|firefox] [--watch]
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const watch = args.includes('--watch');
const targets = args.filter((a) => !a.startsWith('--'));
const browsers = targets.length ? targets : ['chrome', 'firefox'];

const ENTRIES = {
  content: 'src/content/index.ts',
  background: 'src/background/background.ts',
  'popup/popup': 'src/popup/popup.ts',
  'options/options': 'src/options/options.ts',
};

const STATIC = [
  ['src/content/content.css', 'content.css'],
  ['src/ui.css', 'ui.css'],
  ['src/popup/popup.html', 'popup/popup.html'],
  ['src/options/options.html', 'options/options.html'],
  ['icons', 'icons'],
  ['LICENSE', 'LICENSE'],
];

function merge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value) && typeof base[key] === 'object'
        ? merge(base[key], value)
        : value;
  }
  return out;
}

async function readJson(path) {
  return JSON.parse(await readFile(join(root, path), 'utf8'));
}

async function buildBrowser(browser) {
  if (!['chrome', 'firefox'].includes(browser)) throw new Error(`Unknown target: ${browser}`);
  const outdir = join(root, 'dist', browser);
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });

  const pkg = await readJson('package.json');
  const manifest = merge(await readJson('manifests/base.json'), await readJson(`manifests/${browser}.json`));
  manifest.version = pkg.version;
  await writeFile(join(outdir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  for (const [from, to] of STATIC) {
    await cp(join(root, from), join(outdir, to), { recursive: true });
  }

  const options = {
    absWorkingDir: root,
    entryPoints: ENTRIES,
    outdir,
    bundle: true,
    format: 'iife',
    target: browser === 'chrome' ? 'chrome116' : 'firefox140',
    // Readable output helps store reviewers; no minification, no source maps shipped.
    minify: false,
    sourcemap: watch ? 'inline' : false,
    legalComments: 'none',
    logLevel: 'info',
  };
  if (watch) {
    const ctx = await context(options);
    await ctx.watch();
  } else {
    await build(options);
  }
}

for (const browser of browsers) await buildBrowser(browser);
