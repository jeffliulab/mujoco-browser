// Copy MJCF + mesh/texture assets from upstream sources into public/assets/.
// Source:
//   STRETCH_REPO env var (default: /tmp/stretch_mujoco) — cloned from
//   github.com/hello-robot/stretch_mujoco.
//
// This is NOT a build step — it's a one-shot bootstrap. Regenerable via
//   npm run bundle-assets
//
import { cpSync, existsSync, mkdirSync, statSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const publicAssets = join(repoRoot, 'public', 'assets');

const stretchRepo = process.env.STRETCH_REPO ?? '/tmp/stretch_mujoco';
const stretchModels = join(stretchRepo, 'stretch_mujoco', 'models');

if (!existsSync(stretchModels)) {
  console.error(`FAIL: stretch models not found at ${stretchModels}`);
  console.error('Clone it first:');
  console.error('  git clone --depth 1 https://github.com/hello-robot/stretch_mujoco.git /tmp/stretch_mujoco');
  process.exit(2);
}

const stretchOut = join(publicAssets, 'stretch');
mkdirSync(stretchOut, { recursive: true });

// Copy the robot MJCF + the whole assets/ tree as-is. MuJoCo's
// <compiler assetdir="assets"/> directive in stretch.xml expects this layout.
for (const f of ['stretch.xml', 'stretch_mj_3.3.0.xml']) {
  const src = join(stretchModels, f);
  if (existsSync(src)) cpSync(src, join(stretchOut, f));
}
const assetsSrc = join(stretchModels, 'assets');
const assetsDst = join(stretchOut, 'assets');
cpSync(assetsSrc, assetsDst, { recursive: true });

// Total size report.
function dirSize(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(p);
    else total += statSync(p).size;
  }
  return total;
}

const bytes = dirSize(stretchOut);
const mb = (bytes / 1_048_576).toFixed(1);
console.log(`✓ bundled Stretch assets → ${relative(repoRoot, stretchOut)} (${mb} MB)`);

// Emit manifest.json listing every file path relative to stretchOut, so the
// browser loader can seed mujoco-js's virtual FS without hardcoding names.
function walk(dir: string, prefix: string = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}
const manifest = walk(stretchOut).filter((p) => p !== 'manifest.json').sort();
writeFileSync(
  join(stretchOut, 'manifest.json'),
  JSON.stringify({ files: manifest }, null, 2),
);
console.log(`  manifest: ${manifest.length} files`);

// File counts.
function countByExt(dir: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countByExt(p);
      for (const [k, v] of Object.entries(sub)) out[k] = (out[k] ?? 0) + v;
    } else {
      const ext = entry.name.includes('.') ? entry.name.split('.').pop()! : '<noext>';
      out[ext] = (out[ext] ?? 0) + 1;
    }
  }
  return out;
}
console.log('  file mix:', countByExt(stretchOut));
