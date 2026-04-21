# 技术要点与踩坑记录

这个文件汇总 mujoco-js + MJCF + Three.js 镜像过程中踩过的坑。新 agent 或开发者遇到类似症状时先查这里再动手。

## mujoco-js 0.0.7

### 只接受 MuJoCo 3.3 新 API

**症状**：加载 `stretch_mujoco` 上游的 `stretch.xml` 直接 throw，`e.message` 是 undefined。

**原因**：`stretch.xml` 用 `<geom shellinertia="true">`（旧 API）；mujoco-js 0.0.7 基于 MuJoCo 3.3，只接受 `<mesh inertia="shell">`。

**解决**：`stretch_mujoco` 仓库自带 `stretch_mj_3.3.0.xml` 是对应 3.3 的新版，用它。

### exception 解码

**症状**：`mujoco.MjModel.loadFromXML(...)` 抛对象，`e` 有 `excPtr` 字段但 `e.message`、`e.name` 都是 undefined，`toString()` 只给 `"mjCError"`。

**解决**：

```ts
try {
  model = mujoco.MjModel.loadFromXML(path);
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
```

注意：`getExceptionMessage(e)` 本身在某些环境下会抛 "memory access out of bounds"；必须传 `e.excPtr`。代码里的 `?? e` 是 fallback。

### WASM 以 base64 内嵌

**事实**：`mujoco-js/dist/mujoco_wasm.js` 是 11 MB，因为把整个 `.wasm` 以 base64 直接嵌在 JS 里。

**影响**：

- **无需** 单独 fetch `.wasm`
- **无需** Vite 的 `vite-plugin-wasm`
- **无需** COOP/COEP header（仅加载 mujoco-js 本身）
- 只有后续 Web Worker + SharedArrayBuffer 的 Phase 2 会需要 COOP/COEP

**后果**：生产 bundle 未拆分时整个 `dist/assets/index-*.js` ~11 MB（gzip 3 MB）。Phase 8 需要考虑 code-split 或 dynamic import。

## MJCF / 场景

### cam_mode 枚举

MuJoCo C 源码 `mjtCamLight`：

| 值 | 含义 |
|---|---|
| 0 | FIXED |
| 1 | TRACK |
| 2 | TRACKCOM |
| **3** | **TARGETBODY** |
| 4 | TARGETBODYCOM |

hospital_ward_min 的 `demo_view / grasp_view / bedside_view / tv_view` 都是 `mode="targetbody"` → 实际 cam_mode=3。**不是 1 也不是 2**（那是 TRACK 族）。

### `<include>` 会把机载 camera 算进总数

`hospital_ward_min.xml` 自己定义 5 个 camera，通过 `<include file="stretch_mj_3.3.0.xml"/>` 引入的 Stretch 本体还带 5 个机载 camera（d405_rgb / d405_depth / d435i_camera_rgb / d435i_camera_depth / nav_camera_rgb），所以最终 `model.ncam = 10` 不是 5。

### Z-up vs Y-up

MuJoCo 约定 Z-up，Three.js 默认 Y-up。两个方案：

1. ✅ 当前做法：保持世界坐标 Z-up，只改每个 `THREE.PerspectiveCamera.up.set(0, 0, 1)`。简单稳定。
2. ❌ 在 Three 的 scene graph 上套一个 `group.rotation.x = -PI/2`。会把所有后续计算的坐标轴搞乱。

### madduck 家具 mesh

**症状**：`demo/core/assets/scenes/hospital_ward.xml` 引用一堆 madduck 家具 mesh（床头柜、轮椅、输液架等），本地没有这些 OBJ/PNG。

**原因**：上游只提供 `hospital_assets.zip`，但里面是 `.blend` Blender 源文件；Hetzner 服务器上有转换好的 OBJ/PNG，本地机器没有。

**解决**：写 `public/assets/stretch/hospital_ward_min.xml`，用 primitive box / capsule / cylinder 直接替换所有家具 mesh。body 名、body 位置、camera fovy 全部保留，确保后续技能 port 时的几何语义不变。Phase 1b 或 Phase 8 再考虑从 Hetzner scp 回来。

### include 的相对路径

MuJoCo 处理 `<include file="X"/>` 时是相对于**包含者所在目录**解析。所以 `hospital_ward_min.xml` 放在 `public/assets/stretch/` 目录下跟 `stretch_mj_3.3.0.xml` 同级，`<include file="stretch_mj_3.3.0.xml"/>` 才能正确解析。

## 资源管理

### 打包脚本依赖 /tmp/stretch_mujoco

`scripts/bundle-assets.ts` 读的是 `STRETCH_REPO` 环境变量或默认 `/tmp/stretch_mujoco`。第一次跑需要：

```bash
git clone --depth 1 https://github.com/hello-robot/stretch_mujoco.git /tmp/stretch_mujoco
npm run bundle-assets
```

### manifest-based VFS seeding

mujoco-js 需要所有引用的 mesh / texture 都在它的虚拟 FS（MEMFS）里。浏览器不能直接用 `fs`，所以：

1. 构建时 `bundle-assets.ts` 写 `public/assets/stretch/manifest.json`（所有文件相对路径列表）
2. 运行时 `mujoco_loader.ts` / `mujoco_renderer.ts` fetch manifest，然后 fetch 每个文件，按路径写入 mujoco-js 的 `FS.writeFile('/working/<path>', ...)`
3. 之后 `MjModel.loadFromXML('/working/hospital_ward_min.xml')` 的 `<include>` / mesh file 引用都能解析

binary 文件（`.obj/.stl/.png/.jpg/.mtl/.glb`）用 `ArrayBuffer`；文本用 `string`。判定正则 `/\.(obj|stl|png|jpg|jpeg|bin|glb|gltf|mtl)$/i`。

## 坐标与姿态镜像

MuJoCo 的 `data.geom_xpos` 是 `Float64Array`，stride=3（x,y,z）。
`data.geom_xmat` 是 `Float64Array`，stride=9，行主序 3×3 旋转。

Three 的 `Matrix4` 是列主序 4×4。转换：

```ts
function xmat_to_matrix4(xmat: Float64Array, offset: number, out: THREE.Matrix4) {
  const m00 = xmat[offset + 0], m01 = xmat[offset + 1], m02 = xmat[offset + 2];
  const m10 = xmat[offset + 3], m11 = xmat[offset + 4], m12 = xmat[offset + 5];
  const m20 = xmat[offset + 6], m21 = xmat[offset + 7], m22 = xmat[offset + 8];
  out.set(
    m00, m01, m02, 0,
    m10, m11, m12, 0,
    m20, m21, m22, 0,
    0, 0, 0, 1,
  );
}
```

`Matrix4.set` 的第一个参数是 row-major 顺序，所以填入时按行读 mujoco xmat 即可，Three 内部会自己换成列主序存储。

## 开发-验证-继续 pipeline

用户明确过："如果验证通过则继续打桩然后到可运行，建立开发-验证-继续开发的循环 pipeline"。做法：

- **每 phase 做完立刻 headless smoke** → 不 pass 不推进
- 视觉类改动写 `scripts/inspect-*.ts` 作为契约检查，把会默默渲染错的东西用数据验证出来
- `npm run typecheck` 必须 0 错误才 commit
- 视觉层的最终确认由用户在浏览器做，这一步不能 agent 代劳
