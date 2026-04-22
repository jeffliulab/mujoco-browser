// Renderer-contract sanity: load hospital_ward_min.xml and print the exact
// fields the Three.js mirror reads, so we catch stride/name-decode bugs
// without needing a real browser.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import load_mujoco from 'mujoco-js';

const mujoco: any = await (load_mujoco as any)();
const here = dirname(fileURLToPath(import.meta.url));
const assetRoot = join(here, '..', 'public', 'assets', 'stretch');

if (!mujoco.FS.analyzePath('/working').exists) {
  mujoco.FS.mkdir('/working');
  mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
}
function seed(src: string, dst: string) {
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name);
    const d = `${dst}/${e.name}`;
    if (e.isDirectory()) {
      if (!mujoco.FS.analyzePath(d).exists) mujoco.FS.mkdir(d);
      seed(s, d);
    } else {
      const binary = /\.(obj|stl|png|jpg|jpeg|bin|glb|gltf|mtl)$/i.test(e.name);
      if (binary) mujoco.FS.writeFile(d, new Uint8Array(readFileSync(s)));
      else mujoco.FS.writeFile(d, readFileSync(s, 'utf8'));
    }
  }
}
seed(assetRoot, '/working');

const model = mujoco.MjModel.loadFromXML('/working/hospital_ward_min.xml');
const data = new mujoco.MjData(model);

const GT = ['plane', 'hfield', 'sphere', 'capsule', 'ellipsoid', 'cylinder', 'box', 'mesh'];

function decodeName(names: Uint8Array, off: number): string {
  let e = off;
  while (e < names.length && names[e] !== 0) e += 1;
  return new TextDecoder().decode(names.subarray(off, e));
}

const ngeom = model.ngeom as number;
const ncam = model.ncam as number;
const nbody = model.nbody as number;

const geom_type = model.geom_type as Int32Array;
const geom_rgba = model.geom_rgba as Float32Array;
const geom_matid = model.geom_matid as Int32Array;

// Count geom types.
const typeCounts: Record<string, number> = {};
for (let i = 0; i < ngeom; i += 1) {
  const t = GT[geom_type[i]] ?? `type${geom_type[i]}`;
  typeCounts[t] = (typeCounts[t] ?? 0) + 1;
}
console.log(`ngeom=${ngeom}, ncam=${ncam}, nbody=${nbody}`);
console.log('  geom type mix:', typeCounts);

// Camera names.
const names = model.names as Uint8Array;
const name_camadr = model.name_camadr as Int32Array;
const cam_mode = model.cam_mode as Int32Array;
const cam_fovy = model.cam_fovy as Float64Array;
const cam_targetbodyid = model.cam_targetbodyid as Int32Array;
const name_bodyadr = model.name_bodyadr as Int32Array;
console.log('\nCameras:');
for (let i = 0; i < ncam; i += 1) {
  const tb = cam_targetbodyid[i];
  const tbName = tb >= 0 ? decodeName(names, name_bodyadr[tb]) : '(none)';
  console.log(
    `  [${i}] ${decodeName(names, name_camadr[i])}  mode=${cam_mode[i]} fovy=${cam_fovy[i]}° target=${tbName}`,
  );
}

// Step physics once, then print geom_xpos for a few geoms.
mujoco.mj_step(model, data);
const gxpos = data.geom_xpos as Float64Array;
console.log('\nFirst 8 geoms after 1 step:');
for (let i = 0; i < Math.min(8, ngeom); i += 1) {
  const x = gxpos[i * 3 + 0];
  const y = gxpos[i * 3 + 1];
  const z = gxpos[i * 3 + 2];
  const t = GT[geom_type[i]];
  const a = geom_rgba[i * 4 + 3];
  console.log(
    `  [${i}] type=${t} pos=(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) alpha=${a} matid=${geom_matid[i]}`,
  );
}

// Confirm xpos per body (used by targetbody cameras).
const xpos = data.xpos as Float64Array;
console.log('\nKey body world positions (t=1):');
for (let b = 0; b < nbody; b += 1) {
  const bname = decodeName(names, name_bodyadr[b]);
  if (['cup', 'patient', 'visitor_chair', 'tv', 'bed', 'base_link'].includes(bname)) {
    console.log(
      `  ${bname}: (${xpos[b * 3].toFixed(3)}, ${xpos[b * 3 + 1].toFixed(3)}, ${xpos[b * 3 + 2].toFixed(3)})`,
    );
  }
}

// Material PBR probe — confirms the port reads non-zero emission / reflectance
// values so the renderer has something to work with.
const nmat = model.nmat as number;
const name_matadr = model.name_matadr as Int32Array;
const mat_emission = model.mat_emission as Float32Array;
const mat_reflectance = model.mat_reflectance as Float32Array;
const mat_rgba = model.mat_rgba as Float32Array;
console.log(`\nMaterials (nmat=${nmat}):`);
for (let m = 0; m < nmat; m += 1) {
  const mname = decodeName(names, name_matadr[m]);
  const em = mat_emission ? mat_emission[m] : 0;
  const refl = mat_reflectance ? mat_reflectance[m] : 0;
  const r = mat_rgba[m * 4 + 0].toFixed(2);
  const g = mat_rgba[m * 4 + 1].toFixed(2);
  const b = mat_rgba[m * 4 + 2].toFixed(2);
  const a = mat_rgba[m * 4 + 3].toFixed(2);
  const flags: string[] = [];
  if (em > 0) flags.push(`emit=${em.toFixed(2)}`);
  if (refl > 0) flags.push(`refl=${refl.toFixed(2)}`);
  const flagStr = flags.length ? ` [${flags.join(' ')}]` : '';
  console.log(`  [${m.toString().padStart(2)}] ${mname.padEnd(16)} rgba=(${r},${g},${b},${a})${flagStr}`);
}

process.exit(0);
