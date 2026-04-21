// Try loading the robot XML with progressively reduced content to find the
// MJCF feature that makes mujoco-js choke.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import load_mujoco from 'mujoco-js';

const mujoco: any = await (load_mujoco as any)({
  print: (m: string) => console.log('[out]', m),
  printErr: (m: string) => console.log('[err]', m),
});

const assetRoot = '/Users/macbookpro/Local_Root/human-brain-interface-demo/WASM-TEST/public/assets/stretch';

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
if (!mujoco.FS.analyzePath('/working').exists) {
  mujoco.FS.mkdir('/working');
  mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');
}
seed(assetRoot, '/working');

function tryLoad(label: string, xmlPath: string) {
  try {
    mujoco.MjModel.loadFromXML(xmlPath);
    console.log(`✓ ${label}`);
    return true;
  } catch (e: any) {
    const pair = mujoco.getExceptionMessage?.(e.excPtr);
    console.log(`✗ ${label}: ${pair?.[0] ?? e?.name ?? 'Error'}: ${pair?.[1] ?? '(no msg)'}`);
    return false;
  }
}

tryLoad('stretch.xml', '/working/stretch.xml');
tryLoad('stretch_mj_3.3.0.xml', '/working/stretch_mj_3.3.0.xml');

// Strip to minimum: write a minimal stretch that drops mesh declarations and
// uses simple primitives only.
const minimalStretch = `<mujoco model="stretch_min">
  <worldbody>
    <geom name="ground" type="plane" pos="0 0 0" size="5 5 0.1"/>
    <body name="base" pos="0 0 0.2">
      <freejoint/>
      <geom type="box" size="0.2 0.15 0.05"/>
    </body>
  </worldbody>
</mujoco>`;
mujoco.FS.writeFile('/working/stretch_min.xml', minimalStretch);
tryLoad('stretch_min.xml (primitives only)', '/working/stretch_min.xml');

// Try loading with meshes but WITHOUT the compiler-heavy preamble: extract just
// the meshes and a single body.
const justOneMesh = `<mujoco model="one_mesh">
  <compiler angle="radian" assetdir="assets"/>
  <asset>
    <mesh file="base_link_0.obj"/>
  </asset>
  <worldbody>
    <geom name="g" type="mesh" mesh="base_link_0"/>
  </worldbody>
</mujoco>`;
mujoco.FS.writeFile('/working/one_mesh.xml', justOneMesh);
tryLoad('one_mesh.xml (single obj)', '/working/one_mesh.xml');
