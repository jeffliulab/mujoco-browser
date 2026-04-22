// Phase 1: real-time Three.js renderer driven by a live mujoco-js model.
// For each primitive <geom>, build a matching Three mesh; per RAF tick, step
// physics and copy data.geom_xpos / geom_xmat → mesh.position/matrix.
// Mesh-type geoms (robot) render as a wireframe bbox placeholder for now —
// the OBJ loader pipeline is its own follow-up.

import * as THREE from 'three';
import load_mujoco from 'mujoco-js';

// Keep parity with the headless BootOptions but extend for rendering.
export interface RenderSceneOptions {
  sceneUrl: string;
  assetBundleUrl?: string;
  stepsPerFrame?: number;   // physics sub-steps per render frame
  maxRenderFps?: number;    // throttle (default 60)
}

export interface SceneHandle {
  dispose(): void;
  cameraNames: string[];
  setCamera(name: string): void;
  model: any;
  data: any;
  nbody: number;
  ngeom: number;
  ncam: number;
}

// MuJoCo geom type enum (from mjtGeom).
const MJ_GEOM = {
  PLANE: 0,
  HFIELD: 1,
  SPHERE: 2,
  CAPSULE: 3,
  ELLIPSOID: 4,
  CYLINDER: 5,
  BOX: 6,
  MESH: 7,
} as const;

let cachedModule: any = null;
const seededBundles = new Set<string>();
const BINARY_RX = /\.(obj|stl|png|jpg|jpeg|bin|glb|gltf|mtl)$/i;

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

async function seedBundle(mujoco: any, bundleUrl: string): Promise<void> {
  if (seededBundles.has(bundleUrl)) return;
  const manifest = (await (await fetch(`${bundleUrl}/manifest.json`)).json()) as {
    files: string[];
  };
  for (const rel of manifest.files) {
    const url = `${bundleUrl}/${rel}`;
    const dst = `/working/${rel}`;
    const parts = rel.split('/');
    parts.pop();
    let acc = '/working';
    for (const d of parts) {
      acc = `${acc}/${d}`;
      if (!mujoco.FS.analyzePath(acc).exists) mujoco.FS.mkdir(acc);
    }
    if (BINARY_RX.test(rel)) {
      const buf = await (await fetch(url)).arrayBuffer();
      mujoco.FS.writeFile(dst, new Uint8Array(buf));
    } else {
      mujoco.FS.writeFile(dst, await (await fetch(url)).text());
    }
  }
  seededBundles.add(bundleUrl);
}

// Decode MuJoCo's null-terminated names buffer. `names` is a Uint8Array; each
// name starts at the offset given by name_<kind>adr[i] and runs until the next
// 0 byte.
function readName(names: Uint8Array, offset: number): string {
  let end = offset;
  while (end < names.length && names[end] !== 0) end += 1;
  return new TextDecoder().decode(names.subarray(offset, end));
}

function buildGeomMesh(
  type: number,
  size: [number, number, number],
  rgba: [number, number, number, number],
): THREE.Object3D | null {
  const color = new THREE.Color(rgba[0], rgba[1], rgba[2]);
  const opacity = rgba[3];
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity,
  });

  switch (type) {
    case MJ_GEOM.PLANE: {
      // size = [halfX, halfY, gridSpacing] — gridSpacing is cosmetic, skip.
      // MuJoCo plane sits in its local XY plane with normal +Z. Three's
      // PlaneGeometry is also XY with normal +Z by default, so we do NOT
      // rotateX here — doing so would tip the floor 90° into a vertical wall
      // in our Z-up world. Use DoubleSide so it renders even if the camera
      // ends up on the other side (helps degraded-scene debugging).
      const sx = size[0] > 0 ? size[0] * 2 : 20;
      const sy = size[1] > 0 ? size[1] * 2 : 20;
      const planeMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0.02,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        opacity,
      });
      return new THREE.Mesh(new THREE.PlaneGeometry(sx, sy), planeMat);
    }
    case MJ_GEOM.SPHERE:
      return new THREE.Mesh(new THREE.SphereGeometry(size[0], 24, 16), mat);
    case MJ_GEOM.CAPSULE: {
      // size = [radius, halfLength]. Three CapsuleGeometry expects full length.
      const radius = size[0];
      const fullLen = size[1] * 2;
      const g = new THREE.CapsuleGeometry(radius, fullLen, 6, 12);
      // Three's capsule axis is Y; MuJoCo's is Z. Rotate.
      g.rotateX(Math.PI / 2);
      return new THREE.Mesh(g, mat);
    }
    case MJ_GEOM.ELLIPSOID: {
      const g = new THREE.SphereGeometry(1, 24, 16);
      const m = new THREE.Mesh(g, mat);
      m.scale.set(size[0], size[1], size[2]);
      return m;
    }
    case MJ_GEOM.CYLINDER: {
      const radius = size[0];
      const fullLen = size[1] * 2;
      const g = new THREE.CylinderGeometry(radius, radius, fullLen, 28);
      g.rotateX(Math.PI / 2); // mujoco cylinder along Z
      return new THREE.Mesh(g, mat);
    }
    case MJ_GEOM.BOX: {
      const g = new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2);
      return new THREE.Mesh(g, mat);
    }
    case MJ_GEOM.MESH: {
      // Placeholder until OBJ loader lands: small origin-marker sphere tinted
      // by the geom's material. 121 robot mesh geoms as bboxes is visual
      // noise; as 3cm dots they read as a skeleton.
      const g = new THREE.SphereGeometry(0.03, 10, 6);
      return new THREE.Mesh(g, mat);
    }
    default:
      return null;
  }
}

// mj xmat is a 9-element row-major 3x3; Three uses a 16-element column-major 4x4.
function xmatToMatrix4(xmat: Float64Array | Float32Array, offset: number, out: THREE.Matrix4): void {
  // mj_xmat row-major: [r00 r01 r02 | r10 r11 r12 | r20 r21 r22]
  const m00 = xmat[offset + 0];
  const m01 = xmat[offset + 1];
  const m02 = xmat[offset + 2];
  const m10 = xmat[offset + 3];
  const m11 = xmat[offset + 4];
  const m12 = xmat[offset + 5];
  const m20 = xmat[offset + 6];
  const m21 = xmat[offset + 7];
  const m22 = xmat[offset + 8];
  out.set(
    m00, m01, m02, 0,
    m10, m11, m12, 0,
    m20, m21, m22, 0,
    0, 0, 0, 1,
  );
}

export async function mountMujocoScene(
  canvas: HTMLCanvasElement,
  opts: RenderSceneOptions,
): Promise<SceneHandle> {
  const mujoco = await loadModule();
  if (opts.assetBundleUrl) {
    await seedBundle(mujoco, opts.assetBundleUrl);
  } else {
    const xml = await (await fetch(opts.sceneUrl)).text();
    const name = opts.sceneUrl.split('/').pop() ?? 'scene.xml';
    mujoco.FS.writeFile(`/working/${name}`, xml);
  }
  const sceneName = opts.sceneUrl.split('/').pop() ?? 'scene.xml';
  const scenePath = `/working/${sceneName}`;

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

  const ngeom = model.ngeom as number;
  const ncam = model.ncam as number;
  const nbody = model.nbody as number;

  // --- Three.js world ---
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);

  // Hemisphere light = cheap indirect fill that matches indoor lighting
  // better than flat ambient (sky color from above, floor-bounce color from
  // below). In Z-up world we orient via the light itself.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x404050, 0.65);
  hemi.position.set(0, 0, 5);
  scene.add(hemi);

  // Sun-style key light from above + front.
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.8);
  keyLight.position.set(3, -4, 6);  // Z-up: high in +Z, front in -Y
  scene.add(keyLight);

  // Warm interior fill — a point light roughly at ceiling center — gives the
  // room some modeled falloff without needing per-<light> MJCF port.
  const ceilingLight = new THREE.PointLight(0xffe8b5, 1.4, 12, 1.2);
  ceilingLight.position.set(2.5, 0, 2.3);
  scene.add(ceilingLight);

  // Free orbit camera. Set Z-up BEFORE lookAt so the orientation is
  // computed in the correct frame (otherwise Three uses default +Y up and
  // the roll is wrong after we later override .up).
  const freeCam = new THREE.PerspectiveCamera(50, 1, 0.05, 500);
  freeCam.up.set(0, 0, 1);
  freeCam.position.set(6.2, -3.5, 2.4);  // outside the back wall, looking in
  freeCam.lookAt(2.5, 0.3, 0.8);         // aim mid-room, ~person-height

  // Build one THREE.Mesh per geom.
  const geomMeshes: Array<{
    idx: number;
    obj: THREE.Object3D;
  }> = [];

  const geom_type = model.geom_type as Int32Array;
  const geom_size = model.geom_size as Float64Array;
  const geom_rgba = model.geom_rgba as Float32Array;
  const geom_matid = model.geom_matid as Int32Array;
  const mat_rgba = model.mat_rgba as Float32Array | null;

  for (let i = 0; i < ngeom; i += 1) {
    const type = geom_type[i];
    const sx = geom_size[i * 3 + 0];
    const sy = geom_size[i * 3 + 1];
    const sz = geom_size[i * 3 + 2];

    // Material > geom_rgba priority. If the geom specifies a material
    // (geom_matid >= 0), use the material's rgba (this is how MuJoCo's own
    // renderer resolves colors). Only fall back to geom_rgba when the geom
    // has no material reference.
    let r: number;
    let g: number;
    let b: number;
    let a: number;
    const mid = geom_matid[i];
    if (mid >= 0 && mat_rgba) {
      r = mat_rgba[mid * 4 + 0];
      g = mat_rgba[mid * 4 + 1];
      b = mat_rgba[mid * 4 + 2];
      a = mat_rgba[mid * 4 + 3];
    } else {
      r = geom_rgba[i * 4 + 0];
      g = geom_rgba[i * 4 + 1];
      b = geom_rgba[i * 4 + 2];
      a = geom_rgba[i * 4 + 3];
    }
    if (a <= 0) continue; // invisible collision-only geom

    const mesh = buildGeomMesh(type, [sx, sy, sz], [r, g, b, a]);
    if (!mesh) continue;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    geomMeshes.push({ idx: i, obj: mesh });
  }

  // Build MJCF cameras.
  const names = model.names as Uint8Array;
  const name_camadr = model.name_camadr as Int32Array;
  const cam_mode = model.cam_mode as Int32Array;
  const cam_targetbodyid = model.cam_targetbodyid as Int32Array;
  const cam_pos = model.cam_pos as Float64Array;
  const cam_fovy = model.cam_fovy as Float64Array;

  interface MjcfCam {
    name: string;
    three: THREE.PerspectiveCamera;
    mode: number;
    targetBodyId: number;
    worldPos: THREE.Vector3;
  }
  const mjcams: MjcfCam[] = [];
  const cameraNames = ['free'];
  for (let i = 0; i < ncam; i += 1) {
    const name = readName(names, name_camadr[i]);
    const three = new THREE.PerspectiveCamera(cam_fovy[i], 1, 0.05, 500);
    const worldPos = new THREE.Vector3(
      cam_pos[i * 3 + 0],
      cam_pos[i * 3 + 1],
      cam_pos[i * 3 + 2],
    );
    mjcams.push({
      name,
      three,
      mode: cam_mode[i],
      targetBodyId: cam_targetbodyid[i],
      worldPos,
    });
    cameraNames.push(name);
  }

  let activeCamName = 'free';
  const getActiveCam = (): THREE.PerspectiveCamera => {
    if (activeCamName === 'free') return freeCam;
    const found = mjcams.find((c) => c.name === activeCamName);
    return found?.three ?? freeCam;
  };

  // --- Resize handling ---
  const onResize = () => {
    const { clientWidth, clientHeight } = canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    const aspect = clientWidth / Math.max(clientHeight, 1);
    freeCam.aspect = aspect;
    freeCam.updateProjectionMatrix();
    for (const c of mjcams) {
      c.three.aspect = aspect;
      c.three.updateProjectionMatrix();
    }
  };
  onResize();
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);

  // --- Tick loop ---
  const stepsPerFrame = opts.stepsPerFrame ?? 4; // with default timestep 0.002s → ~120Hz render eq
  const minFrameMs = opts.maxRenderFps ? 1000 / opts.maxRenderFps : 0;
  let raf = 0;
  let lastFrameT = 0;
  let disposed = false;

  const geom_xpos_ref = () => data.geom_xpos as Float64Array;
  const geom_xmat_ref = () => data.geom_xmat as Float64Array;
  const xpos_ref = () => data.xpos as Float64Array;
  const tmpMat = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();

  const tick = (nowMs: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    if (minFrameMs > 0 && nowMs - lastFrameT < minFrameMs) return;
    lastFrameT = nowMs;

    try {
      for (let s = 0; s < stepsPerFrame; s += 1) mujoco.mj_step(model, data);
    } catch {
      // Swallow — if physics diverges once, keep rendering last good pose.
    }

    const gxpos = geom_xpos_ref();
    const gxmat = geom_xmat_ref();
    for (const { idx, obj } of geomMeshes) {
      xmatToMatrix4(gxmat, idx * 9, tmpMat);
      tmpMat.setPosition(gxpos[idx * 3 + 0], gxpos[idx * 3 + 1], gxpos[idx * 3 + 2]);
      obj.matrix.copy(tmpMat);
    }

    // Update cameras. mjtCamLight enum:
    //   0 FIXED, 1 TRACK, 2 TRACKCOM, 3 TARGETBODY, 4 TARGETBODYCOM
    // For targetbody modes, we recompute lookAt to the target body's xpos
    // every frame (hospital scene's demo_view / grasp_view / etc. all use
    // mode=3). Fixed cameras use data.cam_xpos which MuJoCo already updates
    // from the MJCF cam_pos/cam_quat each step.
    const xpos = xpos_ref();
    const cam_xpos = data.cam_xpos as Float64Array;
    const cam_xmat = data.cam_xmat as Float64Array;
    for (let i = 0; i < mjcams.length; i += 1) {
      const c = mjcams[i];
      c.three.position.set(
        cam_xpos[i * 3 + 0],
        cam_xpos[i * 3 + 1],
        cam_xpos[i * 3 + 2],
      );
      if ((c.mode === 3 || c.mode === 4) && c.targetBodyId >= 0) {
        const b = c.targetBodyId;
        tmpTarget.set(xpos[b * 3 + 0], xpos[b * 3 + 1], xpos[b * 3 + 2]);
        c.three.lookAt(tmpTarget);
      } else {
        // FIXED / TRACK*: use cam_xmat (row-major 3x3). Column 2 of the matrix
        // is the camera's forward axis in MuJoCo convention (-Z looks into the
        // scene). We synthesize a lookAt point one unit forward.
        // forward = -col2 of xmat (since camera looks down -Z in its local frame)
        const fx = -cam_xmat[i * 9 + 2];
        const fy = -cam_xmat[i * 9 + 5];
        const fz = -cam_xmat[i * 9 + 8];
        tmpTarget.set(
          cam_xpos[i * 3 + 0] + fx,
          cam_xpos[i * 3 + 1] + fy,
          cam_xpos[i * 3 + 2] + fz,
        );
        c.three.lookAt(tmpTarget);
      }
    }
    void tmpPos;

    renderer.render(scene, getActiveCam());
  };
  raf = requestAnimationFrame(tick);

  // MuJoCo uses Z-up; our Three world is Y-up. Rotate the whole scene
  // so Z world → Y screen (matching standard Three.js convention).
  // We do this by wrapping in a group with X-axis rotation.
  // Simpler: leave coordinate frames as-is (Z up) and orient cameras for Z-up.
  // Since Three's PerspectiveCamera defaults to looking along -Z with +Y up,
  // we set up vector to (0,0,1) so "up" in MuJoCo is up on screen.
  const setZUp = (cam: THREE.PerspectiveCamera) => {
    cam.up.set(0, 0, 1);
  };
  setZUp(freeCam);
  for (const c of mjcams) setZUp(c.three);

  return {
    dispose: () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.dispose();
      for (const { obj } of geomMeshes) {
        if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose();
        const m = (obj as THREE.Mesh).material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else if (m) m.dispose();
      }
      try {
        data.delete?.();
        model.delete?.();
      } catch {}
    },
    cameraNames,
    setCamera: (name: string) => {
      if (cameraNames.includes(name)) activeCamName = name;
    },
    model,
    data,
    nbody,
    ngeom,
    ncam,
  };
}
