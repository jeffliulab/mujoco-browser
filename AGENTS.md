---
id: project.mujoco-browser
title: mujoco-browser — Agent 入口
summary: 浏览器化 Anima BCI demo（MuJoCo WASM + Anima L0–L5 + BT + 10 skills，全 TS，静态部署 GitHub Pages）。本文件是会话启动时必读。
audience: [agent]
required_for: [mujoco-browser]
read_after: []
next: [docs/项目总进度.txt, docs/开发进度与待办事项.md, README.md]
updated_at: 2026-04-21
---

# mujoco-browser — Agent 入口

## 项目一句话

把 `human-brain-interface-demo/demo/` 里的 Python Anima + MuJoCo 整套搬进浏览器，零服务器、零 API key、零用户配置，面试官点开 GitHub Pages 链接即可跑。

## 会话启动顺序

1. 先读 `docs/项目总进度.txt`（版本总览，找到"当前开发"那一行）
2. 再读 `docs/开发进度与待办事项.md`（当前版本的任务清单）
3. 再读对应版本的开发日志 `docs/dev-log/V*.md`（最新那条）
4. 再读本项目 `README.md` 对技术栈的一段描述
5. 有需要再按规则去看 `/Users/macbookpro/Local_Root/agent-rules/agent-rules/` 的通用规范

## 项目级约束（必须遵守）

### 端口源

- Anima Python 参考实现唯一路径：`/Users/macbookpro/Local_Root/human-brain-interface-demo/demo/core/anima/`
- 只读参考，不作为运行期依赖
- 不混用 `anima-intention-action/`（那是 TaskSpec 契约 + IP 保护文档仓库，不是实现）

### 关键边界

- 不读写 `/Users/macbookpro/Local_Root/human-brain-interface-demo/WASM-TEST/` — 那是另一 agent 的工作区
- 所有开发都在 `/Users/macbookpro/Local_Root/mujoco-browser/` 内完成

### Anima IP 保护

- 五层架构（L0–L5）、五因素评估（ITA/MQA/SQA/GOA/PEA）、Test-and-Check 六关、LLM-as-Parser、TaskSpec、行为树执行 — 必须保留，不可改
- 浏览器版 L1 是"35 intent 关键词预映射器"，不是真 LLM；UI 必须明示这一点，避免误导
- 署名统一 `Jeff Liu Lab`，公开材料不提 DIARC / Tufts 学术渊源

## 技术栈锁定

- Vite 5 + React 18 + TypeScript 5（严格模式）
- Three.js 0.161（3D 渲染）
- mujoco-js 0.0.7（WASM 物理；注意：只接受 MuJoCo 3.3 新 API）
- zod 3（TaskSpec schema 替代 pydantic）
- 无 Next.js（纯静态托管即可）
- 无 Tailwind（当前用内联样式；Phase 7 再考虑）
- 部署：GitHub Pages（`jeffliulab/mujoco-browser` → Pages）

## 规范来源

本项目遵循 `/Users/macbookpro/Local_Root/agent-rules/agent-rules/` 的以下路径：

- `GLOBAL.md` — 命名、语言、根目录必备文件
- `principles/architecture.md` — 分层与解耦
- `principles/engineering.md` — 配置、错误、日志、依赖
- `stacks/frontend.md` — React + Vite 目录结构
- `workflows/git.md` — 分支、commit 格式
- `workflows/github.md` — 双语 README、徽章
- `workflows/rapid-versioning.md` — 版本总览 + 开发日志（本项目采用此模式）

## 快速入口

| 需求 | 文件 |
|---|---|
| 当前进度 | `docs/项目总进度.txt` |
| 待办事项 | `docs/开发进度与待办事项.md` |
| 开发日志 | `docs/dev-log/V{X.YY}-开发日志.md` |
| 技术要点 & 踩坑 | `docs/tech-notes.md` |
| 项目说明（英文） | `README.md` |
| 项目说明（中文） | `README_zh.md` |
| 总体迁移计划 | `/Users/macbookpro/.claude/plans/a-replicated-harp.md` |

## 命令速查

```bash
npm install            # 装依赖（首次）
npm run dev            # 本地开发服务器 http://localhost:5173
npm run smoke          # Node 无头验证：加载 + 步进 4 个场景
npm run typecheck      # TypeScript 严格检查
npm run build          # 生产构建（tsc + vite）
npm run bundle-assets  # 从 /tmp/stretch_mujoco 重建 public/assets/stretch/
```
