// Phase 0D smoke test: instantiate mujoco-js, load an MJCF scene, step physics.
// Rendering is deliberately not wired up yet — the gate here is "WASM physics runs
// without crashing on our machine" before we invest in Three.js mesh sync.

// The upstream package ships TypeScript definitions but does not declare a
// default export signature, so we import as `any` and narrow at the call site.
import load_mujoco from 'mujoco-js';

export interface MujocoBootReport {
  wallMs: number;
  nbody: number;
  nqpos: number;
  nqvel: number;
  stepsRun: number;
  qpos0: number[];
  qposAfter: number[];
  simTime: number;
}

let cachedModule: any = null;
const seededBundles = new Set<string>();

async function loadModule(): Promise<any> {
  if (cachedModule) return cachedModule;
  cachedModule = await (load_mujoco as unknown as () => Promise<any>)();
  const FS = cachedModule.FS;
  if (!FS.analyzePath('/working').exists) {
    FS.mkdir('/working');
    FS.mount(cachedModule.MEMFS, { root: '.' }, '/working');
  }
  return cachedModule;
}

const BINARY_RX = /\.(obj|stl|png|jpg|jpeg|bin|glb|gltf|mtl)$/i;

async function seedBundle(mujoco: any, bundleUrl: string): Promise<number> {
  if (seededBundles.has(bundleUrl)) return 0;
  const manifestUrl = `${bundleUrl}/manifest.json`;
  const manifest = (await (await fetch(manifestUrl)).json()) as { files: string[] };
  let count = 0;
  for (const rel of manifest.files) {
    const url = `${bundleUrl}/${rel}`;
    const dst = `/working/${rel}`;
    const dirs = rel.split('/');
    dirs.pop();
    let acc = '/working';
    for (const d of dirs) {
      acc = `${acc}/${d}`;
      if (!mujoco.FS.analyzePath(acc).exists) mujoco.FS.mkdir(acc);
    }
    if (BINARY_RX.test(rel)) {
      const buf = await (await fetch(url)).arrayBuffer();
      mujoco.FS.writeFile(dst, new Uint8Array(buf));
    } else {
      const txt = await (await fetch(url)).text();
      mujoco.FS.writeFile(dst, txt);
    }
    count += 1;
  }
  seededBundles.add(bundleUrl);
  return count;
}

export interface BootOptions {
  /** If set, fetches ${assetBundleUrl}/manifest.json and seeds every listed
   *  file into the virtual FS before loading. Required for scenes that use
   *  <include> or <mesh file="..."/>. */
  assetBundleUrl?: string;
  steps?: number;
}

export async function bootMujocoAndStep(
  sceneUrl: string,
  optsOrSteps: BootOptions | number = 200,
): Promise<MujocoBootReport> {
  const t0 = performance.now();
  const opts: BootOptions =
    typeof optsOrSteps === 'number' ? { steps: optsOrSteps } : optsOrSteps;
  const steps = opts.steps ?? 200;
  const mujoco = await loadModule();

  let scenePath: string;
  if (opts.assetBundleUrl) {
    await seedBundle(mujoco, opts.assetBundleUrl);
    const sceneName = sceneUrl.split('/').pop() ?? 'scene.xml';
    scenePath = `/working/${sceneName}`;
    // Scene file is already in the bundle.
  } else {
    const xml = await (await fetch(sceneUrl)).text();
    const sceneName = sceneUrl.split('/').pop() ?? 'scene.xml';
    scenePath = `/working/${sceneName}`;
    mujoco.FS.writeFile(scenePath, xml);
  }

  let model: any;
  try {
    model = mujoco.MjModel.loadFromXML(scenePath);
  } catch (e: any) {
    let decoded: string | null = null;
    if (typeof mujoco.getExceptionMessage === 'function') {
      try {
        const pair = mujoco.getExceptionMessage(e?.excPtr ?? e);
        if (Array.isArray(pair)) decoded = `${pair[0]}: ${pair[1]}`;
      } catch {}
    }
    throw new Error(decoded ?? e?.message ?? String(e));
  }
  const data = new mujoco.MjData(model);

  const nbody = model.nbody as number;
  const nqpos = model.nq as number;
  const nqvel = model.nv as number;

  const qposSnap = (n: number): number[] => {
    const q = data.qpos as Float64Array;
    return Array.from(q.slice(0, Math.min(6, n)));
  };

  const qpos0 = qposSnap(nqpos);
  for (let i = 0; i < steps; i += 1) {
    mujoco.mj_step(model, data);
  }
  const qposAfter = qposSnap(nqpos);
  const simTime = data.time as number;

  return {
    wallMs: performance.now() - t0,
    nbody,
    nqpos,
    nqvel,
    stepsRun: steps,
    qpos0,
    qposAfter,
    simTime,
  };
}
