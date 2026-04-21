[![Language: English](https://img.shields.io/badge/Language-English-2f81f7?style=flat-square)](README.md) [![语言: 简体中文](https://img.shields.io/badge/语言-简体中文-e67e22?style=flat-square)](README_zh.md)

# mujoco-browser

[![Vite](https://img.shields.io/badge/Vite-5-646cff?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev) [![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react&logoColor=black)](https://react.dev) [![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org) [![Three.js](https://img.shields.io/badge/Three.js-0.161-000000?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org) [![MuJoCo](https://img.shields.io/badge/MuJoCo-WASM-0f8653?style=flat-square)](https://github.com/google-deepmind/mujoco) [![License](https://img.shields.io/badge/License-Apache--2.0-blue?style=flat-square)](#license) [![Status](https://img.shields.io/badge/status-V0.2%20in--progress-yellow?style=flat-square)](docs/项目总进度.txt)

Full in-browser port of the Anima BCI embodied-robotics demo: MuJoCo physics, Three.js rendering, the Anima L0–L5 cognitive stack, a py_trees-style behaviour tree, and 10 skills — all TypeScript, zero server, zero API key, zero user configuration, deployable to GitHub Pages as a pure static site.

---

## Highlights

- **MuJoCo in the browser**: `mujoco-js` 0.0.7 runs the official Stretch RE3 robot model plus a degraded hospital-ward scene, stepping real physics at 60+ Hz
- **Live rendering mirror**: per-frame `data.geom_xpos / geom_xmat` copied into a Three.js scene graph; all 6 primitive geom types render natively, 10 MJCF cameras selectable
- **No server, no LLM, no keys**: L1 intent parser is a 35-token keyword mapper — runs fully offline, no fetch calls at runtime
- **Anima IP preserved**: L0–L5 layer separation, 5-factor event-triggered assessment (ITA / MQA / SQA / GOA / PEA), Test-and-Check 6-gate validation, TaskSpec intermediate representation, behaviour-tree execution
- **Static deploy target**: single `npm run build` → GitHub Pages, no CI infra, no backend

---

## Table of Contents

- [Highlights](#highlights)
- [Project Status](#project-status)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Scenes](#scenes)
- [Non-goals](#non-goals)
- [Links](#links)
- [License](#license)

---

## Project Status

| Version | State | Scope |
|---|---|---|
| V0.1 | ✅ archived 2026-04-21 | Browser feasibility + physics smoke — 4 scenes pass, 96.6 MB of Stretch meshes bundled, hospital_ward_min scene loads cleanly |
| **V0.2** | **🚧 in progress** | Three.js renderer for primitive geoms + robot mesh loader |
| V0.3 – V0.7 | planned | Physics worker · BT engine · Anima L0–L5 · 10 skills · L1 keyword mapper · UI shell · GitHub Pages deploy |

Detailed roster: [`docs/项目总进度.txt`](docs/项目总进度.txt). Current sprint tasks: [`docs/开发进度与待办事项.md`](docs/开发进度与待办事项.md). Per-version logs: [`docs/dev-log/`](docs/dev-log/).

---

## Project Structure

```text
mujoco-browser/
├── AGENTS.md                 # Agent session entry point (read first)
├── README.md / README_zh.md  # Human entry (this file)
├── package.json / vite.config.ts / tsconfig.json
├── index.html
├── docs/
│   ├── 项目总进度.txt           # Version roster (V0.1 done, V0.2 active)
│   ├── 开发进度与待办事项.md    # Current-sprint todo
│   ├── tech-notes.md         # MJCF / mujoco-js gotchas, all in one place
│   └── dev-log/              # V{X.YY}-开发日志.md per archived version
├── scripts/
│   ├── bundle-assets.ts      # Copy stretch_mujoco → public/assets/stretch/ (+ manifest.json)
│   ├── smoke-mujoco.ts       # Headless Node smoke: load + step 4 scenes
│   ├── inspect-scene.ts      # Renderer contract sanity (cam names, geom types, xpos)
│   ├── bisect-stretch.ts     # Diagnostic: MJCF feature bisect when loadFromXML throws
│   └── inspect-module.ts     # Diagnostic: mujoco-js exception shape introspection
├── public/assets/
│   ├── scenes/               # Built-in examples (simple.xml, humanoid.xml)
│   └── stretch/              # Stretch RE3 + hospital_ward_min.xml + 147 mesh/texture files
└── src/
    ├── main.tsx
    ├── app/                  # React shell
    └── sim/                  # mujoco loader (headless report) + live Three.js renderer
```

Planned directories (land in V0.3 – V0.7): `src/bt/`, `src/anima/`, `src/skills/`, `src/llm/`, `src/ui/`, `.github/workflows/`.

---

## Quick Start

```bash
# 1. install deps
npm install

# 2. headless physics smoke (Node, ~5 s)
npm run smoke
# ✓ simple.xml / humanoid.xml / stretch_mj_3.3.0.xml / hospital_ward_min.xml

# 3. local dev server
npm run dev
# open http://localhost:5173
# click "Load hospital_ward_min.xml (Phase 0F)" → live scene

# 4. type-check + production build
npm run typecheck
npm run build
```

<details>
<summary>Regenerating the asset bundle</summary>

```bash
git clone --depth 1 https://github.com/hello-robot/stretch_mujoco.git /tmp/stretch_mujoco
npm run bundle-assets
# → public/assets/stretch/ refreshed from upstream + manifest.json rewritten
```

`public/assets/stretch/` is committed to git (97 MB, within GitHub limits) so `npm run dev` works out of the box without this step.
</details>

---

## Scenes

| Scene | Source | Gate |
|---|---|---|
| `simple.xml` | mujoco-js built-in | Step a free-falling box |
| `humanoid.xml` | mujoco-js built-in | 17-body humanoid dynamics |
| `stretch_mj_3.3.0.xml` | `hello-robot/stretch_mujoco` (upstream) | Robot-only load (38 bodies) |
| `hospital_ward_min.xml` | **this repo** | Degraded hospital ward + Stretch (49 bodies / 10 cameras). Replaces the Hetzner-only `madduck` furniture meshes with primitive stand-ins preserving topology. |

The full-fidelity `hospital_ward.xml` from `demo/core/assets/scenes/` depends on converted `madduck` furniture meshes that live only on the project's Hetzner server. `hospital_ward_min.xml` is the local fallback.

---

## Non-goals

- **No real LLM calls**: L1 is a keyword mapper by design (browser-only constraint). The full LLM-as-Parser reference implementation stays in [`human-brain-interface-demo/demo/core/anima/`](https://github.com/jeffliulab/human-brain-interface-demo).
- **No production-hardened UX**: V0.7 UI shell is functional, not polished.
- **No parity with `demo/web/`**: independent rebuild, not a shared component library.
- **No photo-real rendering**: primitives first, mesh loader in V0.2 is geometry-only. Lighting and textures come later if needed.

---

## Links

- Design stack (Anima IP): [`anima-intention-action`](https://github.com/jeffliulab/anima-intention-action) — TaskSpec contract, Anima framework docs
- Upstream Anima Python reference: [`human-brain-interface-demo/demo/core/anima/`](https://github.com/jeffliulab/human-brain-interface-demo) (read-only, port source)
- Stretch RE3 model: [`hello-robot/stretch_mujoco`](https://github.com/hello-robot/stretch_mujoco)
- MuJoCo WASM binding: [`mujoco-js`](https://www.npmjs.com/package/mujoco-js)

---

## License

Apache 2.0. Author: **Jeff Liu Lab** ([jeffliulab.com](https://jeffliulab.com) · [@jeffliulab](https://github.com/jeffliulab)).

Stretch RE3 assets bundled under `public/assets/stretch/` are redistributed from `hello-robot/stretch_mujoco` (Apache 2.0); see that repo for third-party credits.
