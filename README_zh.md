[![Language: English](https://img.shields.io/badge/Language-English-2f81f7?style=flat-square)](README.md) [![语言: 简体中文](https://img.shields.io/badge/语言-简体中文-e67e22?style=flat-square)](README_zh.md)

# mujoco-browser

[![在线 demo](https://img.shields.io/badge/在线%20demo-jeffliulab.github.io-22c55e?style=flat-square&logo=github)](https://jeffliulab.github.io/mujoco-browser/) [![Vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev) [![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![Three.js](https://img.shields.io/badge/Three.js-0.161-000000?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org) [![MuJoCo](https://img.shields.io/badge/MuJoCo-WASM-0f8653?style=flat-square)](https://github.com/google-deepmind/mujoco) [![License](https://img.shields.io/badge/License-Apache--2.0-blue?style=flat-square)](#许可证) [![Status](https://img.shields.io/badge/status-V0.2%20进行中-yellow?style=flat-square)](docs/项目总进度.txt)

把 Anima BCI 具身机器人 demo 整套搬进浏览器：MuJoCo 物理、Three.js 渲染、Anima L0–L5 认知栈、py_trees 风格的行为树、10 个技能 —— 全部 TypeScript，零服务器、零 API key、零用户配置，可直接作为静态页面部署到 GitHub Pages。

---

## 亮点

- 🌐 **在线 demo**：[jeffliulab.github.io/mujoco-browser](https://jeffliulab.github.io/mujoco-browser/) — 每次推 `main` 触发 GitHub Actions 自动部署
- **浏览器里跑 MuJoCo**：`mujoco-js` 0.0.7 加载官方 Stretch RE3 机器人和降级版医院病房场景，60+ Hz 真物理步进
- **渲染实时镜像**：每帧把 `data.geom_xpos / geom_xmat` 拷到 Three.js scene graph；6 种 primitive 几何体原生渲染，10 个 MJCF 相机可切换
- **无服务器、无 LLM、无 Key**：L1 意图解析器是 35 个 intent 关键词映射表 —— 完全离线跑，运行时零 fetch
- **Anima IP 保留**：L0–L5 层次划分、五因素事件触发评估（ITA / MQA / SQA / GOA / PEA）、Test-and-Check 六关校验、TaskSpec 中间表示、行为树执行
- **静态部署**：`npm run build` 产物直接扔 GitHub Pages，除一个 Actions workflow 外无额外 CI 基础设施、无后端

---

## 目录

- [亮点](#亮点)
- [项目状态](#项目状态)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [场景](#场景)
- [Non-goals](#non-goals)
- [相关链接](#相关链接)
- [许可证](#许可证)

---

## 项目状态

| 版本 | 状态 | 范围 |
|---|---|---|
| V0.1 | ✅ 2026-04-21 归档 | 浏览器可行性 + 物理 smoke — 4 个场景通过，96.6 MB Stretch mesh 打包进库，hospital_ward_min 场景正常加载 |
| **V0.2** | **🚧 进行中** | Three.js 渲染器（primitive geom）+ 机器人 mesh 加载器 |
| V0.3 – V0.7 | 计划中 | 物理 worker · 行为树引擎 · Anima L0–L5 · 10 技能 · L1 关键词映射 · UI 外壳 · GitHub Pages 部署 |

版本总览详细：[`docs/项目总进度.txt`](docs/项目总进度.txt)。当前迭代任务：[`docs/开发进度与待办事项.md`](docs/开发进度与待办事项.md)。分版本日志：[`docs/dev-log/`](docs/dev-log/)。

---

## 项目结构

```text
mujoco-browser/
├── AGENTS.md                 # Agent 会话入口（先读这个）
├── README.md / README_zh.md  # 人类入口
├── package.json / vite.config.ts / tsconfig.json
├── index.html
├── docs/
│   ├── 项目总进度.txt           # 版本总览（V0.1 已归档，V0.2 进行中）
│   ├── 开发进度与待办事项.md    # 当前迭代任务
│   ├── tech-notes.md         # MJCF / mujoco-js 踩坑记录
│   └── dev-log/              # 每个归档版本的 V{X.YY}-开发日志.md
├── scripts/
│   ├── bundle-assets.ts      # 复制 stretch_mujoco → public/assets/stretch/（含 manifest.json）
│   ├── smoke-mujoco.ts       # Node 无头 smoke：加载 + 步进 4 个场景
│   ├── inspect-scene.ts      # 渲染器契约检查（相机名、geom 类型、xpos）
│   ├── bisect-stretch.ts     # 诊断：loadFromXML 报错时的 MJCF 功能二分
│   └── inspect-module.ts     # 诊断：mujoco-js 异常对象形状探测
├── public/assets/
│   ├── scenes/               # 内置示例（simple.xml、humanoid.xml）
│   └── stretch/              # Stretch RE3 + hospital_ward_min.xml + 147 个 mesh/texture 文件
└── src/
    ├── main.tsx
    ├── app/                  # React 外壳
    └── sim/                  # mujoco loader（headless 报告）+ 实时 Three.js 渲染器
```

未来版本会加的目录（V0.3 – V0.7）：`src/bt/`、`src/anima/`、`src/skills/`、`src/llm/`、`src/ui/`、`.github/workflows/`。

---

## 快速开始

```bash
# 1. 装依赖
npm install

# 2. Node 无头物理 smoke（~5 秒）
npm run smoke
# ✓ simple.xml / humanoid.xml / stretch_mj_3.3.0.xml / hospital_ward_min.xml

# 3. 本地开发服务器
npm run dev
# 打开 http://localhost:5173
# 点 "Load hospital_ward_min.xml (Phase 0F)" → 实时场景

# 4. 类型检查 + 生产构建
npm run typecheck
npm run build
```

<details>
<summary>重新生成资源包</summary>

```bash
git clone --depth 1 https://github.com/hello-robot/stretch_mujoco.git /tmp/stretch_mujoco
npm run bundle-assets
# → 从上游刷新 public/assets/stretch/，重写 manifest.json
```

`public/assets/stretch/` 已经 commit 进 git（97 MB，在 GitHub 限额内），所以 `npm run dev` 开箱即可，不需要跑这步。
</details>

---

## 场景

| 场景 | 来源 | 验收门槛 |
|---|---|---|
| `simple.xml` | mujoco-js 自带 | 自由下落盒子能步进 |
| `humanoid.xml` | mujoco-js 自带 | 17 体 humanoid 动力学 |
| `stretch_mj_3.3.0.xml` | `hello-robot/stretch_mujoco`（上游） | 机器人单独加载（38 bodies） |
| `hospital_ward_min.xml` | **本仓库** | 降级版病房 + Stretch（49 bodies / 10 相机）。把只在 Hetzner 上有的 `madduck` 家具 mesh 换成 primitive 占位，拓扑保留。 |

完整的 `hospital_ward.xml`（来自 `demo/core/assets/scenes/`）依赖 `madduck` 家具的转换 mesh，只存在于项目的 Hetzner 服务器上；`hospital_ward_min.xml` 是本地可跑的替代版本。

---

## Non-goals

- **不接真 LLM**：L1 用关键词映射是设计选择（浏览器版约束）。完整 LLM-as-Parser 参考实现在 [`human-brain-interface-demo/demo/core/anima/`](https://github.com/jeffliulab/human-brain-interface-demo)。
- **非生产级 UX**：V0.7 UI 外壳是功能完整，不做精修。
- **不与 `demo/web/` 复用组件**：独立重建，不共享代码库。
- **非照片级渲染**：V0.2 先出几何，纹理/光照后面再说。

---

## 相关链接

- 设计栈 / Anima IP：[`anima-intention-action`](https://github.com/jeffliulab/anima-intention-action) — TaskSpec 契约 + Anima 框架文档
- Anima Python 参考实现：[`human-brain-interface-demo/demo/core/anima/`](https://github.com/jeffliulab/human-brain-interface-demo)（只读，port 源）
- Stretch RE3 模型：[`hello-robot/stretch_mujoco`](https://github.com/hello-robot/stretch_mujoco)
- MuJoCo WASM 绑定：[`mujoco-js`](https://www.npmjs.com/package/mujoco-js)

---

## 许可证

Apache 2.0。作者：**Jeff Liu Lab**（[jeffliulab.com](https://jeffliulab.com) · [@jeffliulab](https://github.com/jeffliulab)）。

`public/assets/stretch/` 下的 Stretch RE3 资源转载自 `hello-robot/stretch_mujoco`（Apache 2.0）；第三方署名详见该仓库。
