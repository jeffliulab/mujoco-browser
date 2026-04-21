import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import load_mujoco from 'mujoco-js';

const mujoco: any = await (load_mujoco as any)({
  print: (m: string) => console.log('[out]', m),
  printErr: (m: string) => console.log('[err]', m),
});

// Seed stretch assets.
const root = '/Users/macbookpro/Local_Root/human-brain-interface-demo/WASM-TEST/public/assets/stretch';
mujoco.FS.mkdir('/working');
mujoco.FS.mount(mujoco.MEMFS, { root: '.' }, '/working');

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
seed(root, '/working');

// Try the load and inspect the exception object's properties
try {
  mujoco.MjModel.loadFromXML('/working/stretch.xml');
  console.log('OK: loaded');
} catch (e: any) {
  console.log('Caught exception object.');
  console.log('  typeof:', typeof e);
  console.log('  keys:', Object.keys(e));
  console.log('  toString:', String(e));
  console.log('  name:', e.name);
  console.log('  excPtr:', e.excPtr);
  // skip ExceptionInfo — not exported in this build.
  // try direct helpers
  if (typeof e.getMessage === 'function') console.log('  e.getMessage():', e.getMessage());
  if (typeof mujoco.getExceptionMessage === 'function') {
    try {
      const r = mujoco.getExceptionMessage(e.excPtr);
      console.log('  getExceptionMessage(ptr):', r);
    } catch (er) {
      console.log('  getExceptionMessage(ptr) threw:', (er as Error).message);
    }
    try {
      const r2 = mujoco.getExceptionMessage(e);
      console.log('  getExceptionMessage(obj):', r2);
    } catch (er) {
      console.log('  getExceptionMessage(obj) threw:', (er as Error).message);
    }
  }
}
