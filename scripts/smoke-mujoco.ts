// Headless MuJoCo WASM smoke test.
// Runs the same instantiate -> load XML -> mj_step path that the browser would,
// but in Node via tsx. If this passes the browser will almost certainly pass too.
//
//   npm run smoke
//
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import load_mujoco from 'mujoco-js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

interface SceneSpec {
  label: string;
  sceneRel: string;
  // If the MJCF uses relative paths (meshes, includes, textures), set this
  // to the directory that should be mirrored into MuJoCo's virtual FS under
  // /working/.
  assetRootRel?: string;
  steps?: number;
}

async function seedVirtualFs(
  mujoco: any,
  srcDir: string,
  virtualDir: string,
): Promise<number> {
  let count = 0;
  const fs = mujoco.FS;
  if (!fs.analyzePath(virtualDir).exists) fs.mkdir(virtualDir);

  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = join(srcDir, entry.name);
    const dstPath = `${virtualDir}/${entry.name}`;
    if (entry.isDirectory()) {
      count += await seedVirtualFs(mujoco, srcPath, dstPath);
    } else {
      const binary = /\.(obj|stl|png|jpg|jpeg|bin|glb|gltf|mtl)$/i.test(entry.name);
      if (binary) {
        const buf = readFileSync(srcPath);
        fs.writeFile(dstPath, new Uint8Array(buf));
      } else {
        fs.writeFile(dstPath, readFileSync(srcPath, 'utf8'));
      }
      count += 1;
    }
  }
  return count;
}

async function runScene(spec: SceneSpec) {
  const t0 = performance.now();
  const logs: string[] = [];
  const mujoco = await (load_mujoco as unknown as (opts?: any) => Promise<any>)({
    print: (msg: string) => logs.push(`[stdout] ${msg}`),
    printErr: (msg: string) => logs.push(`[stderr] ${msg}`),
  });

  // Fresh /working tree per run so scenes can't step on each other.
  const root = '/working';
  if (!mujoco.FS.analyzePath(root).exists) {
    mujoco.FS.mkdir(root);
    mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, root);
  }

  let seeded = 0;
  if (spec.assetRootRel) {
    const abs = join(repoRoot, spec.assetRootRel);
    seeded = await seedVirtualFs(mujoco, abs, root);
  } else {
    const xml = readFileSync(join(repoRoot, spec.sceneRel), 'utf8');
    const name = spec.sceneRel.split('/').pop()!;
    mujoco.FS.writeFile(`${root}/${name}`, xml);
    seeded = 1;
  }

  const sceneName = spec.sceneRel.split('/').pop()!;
  const scenePath = `${root}/${sceneName}`;

  let model: any;
  try {
    model = mujoco.MjModel.loadFromXML(scenePath);
  } catch (e: any) {
    // Emscripten wraps C++ exceptions. getExceptionMessage(exc) returns
    // [name, message] strings.
    let decoded: string | null = null;
    if (typeof mujoco.getExceptionMessage === 'function') {
      try {
        const pair = mujoco.getExceptionMessage(e);
        if (Array.isArray(pair)) decoded = `${pair[0]}: ${pair[1]}`;
      } catch {}
    }
    const msg = decoded ?? (e?.message ?? JSON.stringify(e) ?? String(e));
    return {
      label: spec.label,
      ok: false,
      err: `loadFromXML failed: ${msg}  (typeof=${typeof e})`,
      mujocoLogs: logs,
      wallMs: (performance.now() - t0).toFixed(1),
      seeded,
    };
  }
  const data = new mujoco.MjData(model);

  const steps = spec.steps ?? 200;
  const qpos0 = Array.from((data.qpos as Float64Array).slice(0, 6));
  for (let i = 0; i < steps; i += 1) mujoco.mj_step(model, data);
  const qposAfter = Array.from((data.qpos as Float64Array).slice(0, 6));

  const moved =
    qpos0.some((v, i) => Math.abs(v - (qposAfter[i] ?? v)) > 1e-6) ||
    (data.time as number) > 0;

  return {
    label: spec.label,
    ok: true,
    moved,
    wallMs: (performance.now() - t0).toFixed(1),
    seeded,
    nbody: model.nbody as number,
    nq: model.nq as number,
    nv: model.nv as number,
    time: (data.time as number).toExponential(3),
    qpos0: qpos0.map((v) => v.toFixed(3)),
    qposAfter: qposAfter.map((v) => v.toFixed(3)),
  };
}

(async () => {
  const scenes: SceneSpec[] = [
    { label: 'simple.xml', sceneRel: 'public/assets/scenes/simple.xml' },
    { label: 'humanoid.xml', sceneRel: 'public/assets/scenes/humanoid.xml' },
    {
      // stretch.xml (the default) uses the old shellinertia="true" attribute on
      // geoms; mujoco-js 0.0.7 only accepts the new inertia="shell" on <mesh>.
      // stretch_mj_3.3.0.xml is the MuJoCo-3.3.0-compatible sibling.
      label: 'stretch_mj_3.3.0.xml (robot only)',
      sceneRel: 'public/assets/stretch/stretch_mj_3.3.0.xml',
      assetRootRel: 'public/assets/stretch',
    },
    {
      // Phase 0F feasibility gate: degraded hospital ward (primitive boxes
      // instead of madduck meshes) + stretch robot + 5 cameras. If this passes,
      // Route A is viable without the Hetzner-only furniture asset pack.
      label: 'hospital_ward_min.xml (degraded scene + robot)',
      sceneRel: 'public/assets/stretch/hospital_ward_min.xml',
      assetRootRel: 'public/assets/stretch',
    },
  ];

  let allOk = true;
  for (const s of scenes) {
    try {
      const r = await runScene(s);
      const passed = r.ok && r.moved;
      if (!passed) allOk = false;
      const mark = passed ? '✓' : '✗';
      console.log(`${mark} ${r.label}`);
      if (!r.ok) {
        console.log(`    ${r.err}  (seeded=${r.seeded} wall=${r.wallMs}ms)`);
        if (r.mujocoLogs && r.mujocoLogs.length)
          for (const line of r.mujocoLogs.slice(-15)) console.log(`    ${line}`);
        continue;
      }
      console.log(
        `    seeded=${r.seeded} wall=${r.wallMs}ms nbody=${r.nbody} nq=${r.nq} nv=${r.nv} time=${r.time}`,
      );
      console.log(`    qpos0     = [${(r.qpos0 ?? []).join(', ')}]`);
      console.log(`    qposAfter = [${(r.qposAfter ?? []).join(', ')}]`);
    } catch (e) {
      allOk = false;
      console.error(`✗ ${s.label}:`, (e as Error).message);
    }
  }
  process.exit(allOk ? 0 : 1);
})();
// keep ref to silence unused warnings in some tsc settings
void relative;
