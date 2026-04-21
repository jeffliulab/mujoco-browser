import * as THREE from 'three';

// Phase 0C smoke test: a Three.js canvas with a spinning cube.
// This proves the scaffold + build pipeline works before we add MuJoCo.
// Replaced in Phase 0D by a real mujoco-wasm boot.
export async function bootEmptyScene(canvas: HTMLCanvasElement): Promise<() => void> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d12);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(3, 2.5, 3);
  camera.lookAt(0, 0, 0);

  const grid = new THREE.GridHelper(10, 10, 0x223044, 0x151a26);
  scene.add(grid);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x5fb3ff, roughness: 0.3 }),
  );
  cube.position.y = 0.5;
  scene.add(cube);

  const light = new THREE.DirectionalLight(0xffffff, 2.0);
  light.position.set(4, 6, 4);
  scene.add(light);
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const onResize = () => {
    const { clientWidth, clientHeight } = canvas;
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / Math.max(clientHeight, 1);
    camera.updateProjectionMatrix();
  };
  onResize();
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);

  let raf = 0;
  const tick = (t: number) => {
    cube.rotation.y = t / 1500;
    cube.rotation.x = t / 2300;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
  };
}
