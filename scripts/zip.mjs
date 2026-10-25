// Packages dist/<browser> into release/ for store upload (after `npm run build`).
// Also writes a source archive for Firefox Add-ons review.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const release = join(root, 'release');
mkdirSync(release, { recursive: true });

for (const browser of ['chrome', 'firefox']) {
  const dir = join(root, 'dist', browser);
  if (!existsSync(dir)) throw new Error(`Missing ${dir}. Run npm run build first.`);
  const out = join(release, `assignment-tracker-${browser}-${version}.zip`);
  rmSync(out, { force: true });
  execFileSync('zip', ['-r', '-X', '-q', out, '.'], { cwd: dir, stdio: 'inherit' });
  console.log(`wrote ${out}`);
}

const source = join(release, `assignment-tracker-source-${version}.zip`);
rmSync(source, { force: true });
execFileSync('git', ['archive', '--format=zip', '-o', source, 'HEAD'], { cwd: root, stdio: 'inherit' });
console.log(`wrote ${source}`);
