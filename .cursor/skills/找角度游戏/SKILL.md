---
name: 找角度游戏
description: 找角度游戏 / Angle Finder Game — 从粗糙单视角 Gaussian 生成可玩的「找最佳观察角度」识别游戏。默认在 PlayCanvas 中运行；图片上传 → Fast Gaussian API → orbit 相机 → 清晰度揭示 → 猜测 → 胜负。
---

# 找角度游戏（Angle Finder Game）

## Purpose

从用户上传的场景图片出发，调用**公司快速高斯 API**（单视角、粗糙但极速），生成一个 **「找角度」识别游戏**：玩家通过旋转/环绕粗糙 Gaussian splat，在模糊与清晰之间探索，找到最佳观察角度后猜出物体/场景是什么。

**粗糙单视角高斯是预期输入，不是错误。** 游戏机制正是围绕这一限制设计的。

**禁止**在 Skill 内实现高斯重建算法；**禁止**要求完整多视角语义标签图作为核心玩法前提。

## When to Use

- 用户有快速/粗糙的单视角 Gaussian 输出，只有一个角度能看清物体
- 用户想要「旋转找角度 → 逐渐清晰 → 猜是什么」的识别/解谜小游戏
- Loopit 移动端合作：触摸拖拽环绕、短时会话、轻量 UI
- 公司新 fast pipeline 产物需要快速变成可玩 demo

## When Not to Use

- 完整 labeled splat 场景 + 多机制玩法 → 用 `labeled-gaussian-game-generator`
- 用户需要自由行走、语义标签驱动的复杂交互
- 用户只要技术预览、无游戏目标

## Required Inputs

| 输入 | 必需 | 说明 |
|------|------|------|
| 用户场景图片 | ✓ | 提交给 fast Gaussian API 的源图 |
| 正确答案标签 | ✓ | 物体/场景名称（来自用户或 API `subject_label`） |
| Fast Gaussian API 配置 | ✓ | 环境变量或本地 config JSON |
| API 返回资产 | ✓ | sog/ply、splat URL、metadata（含 source camera） |

## Playable Runtime（默认：PlayCanvas）

**主运行时在 PlayCanvas**，不是 standalone HTML。

| 项 | 值 |
|----|-----|
| 本地脚本 | `C:\WORKS\playcanvas\scripts\angle-finder\` |
| Project | **1557749** |
| Scene | **2540280** |
| Launch | https://playcanvas.com/editor/scene/2540280 |

```bash
cd C:\WORKS\playcanvas
node scripts/upload-angle-finder.mjs   # 需 .env PLAYCANVAS_API_TOKEN
```

架构与测试清单见 [`references/playcanvas-angle-game-pattern.md`](references/playcanvas-angle-game-pattern.md)。

### PlayCanvas 脚本

```text
scripts/angle-finder/
├── angle-orbit-camera.js    # orbit + touch/mouse
├── clarity-controller.js      # angle → clarity → GSplat LOD/fog
├── angle-game-manager.js      # 状态机、计时、胜负
├── angle-guess-ui.js          # Canvas2D 多选 UI
├── gsplat-loader.js           # .sog / placeholder
└── data/
    ├── game-spec.json
    ├── gaussian-metadata.json
    └── clarity-curve.json
```

## Pipeline Workflow

```text
用户图片 → prepare_image_upload.py → request_fast_gaussian_api.py
  → build_clarity_curve.py → game-spec.json + metadata
  → 更新 scripts/angle-finder/data/*.json
  → upload-angle-finder.mjs → PlayCanvas Launch
```

## Dev Fallback（仅调试）

`output-angle-game/` 是 Three.js 本地原型，**不是交付运行时**：

```bash
cd output-angle-game
python -m http.server 8080
```

用于 API 契约、clarity 曲线、UI 流程的快速迭代；正式 demo 走 PlayCanvas。

## Image Input & Upload

```bash
python .cursor/skills/找角度游戏/scripts/prepare_image_upload.py path/to/photo.jpg
python .cursor/skills/找角度游戏/scripts/request_fast_gaussian_api.py output-angle-game/input/source-image.jpg \
  --output-dir output-angle-game/assets --dry-run
python .cursor/skills/找角度游戏/scripts/build_clarity_curve.py output-angle-game/assets/gaussian-metadata.json \
  --output output-angle-game/generated/clarity-curve.json
```

生成后复制 JSON 到 `C:\WORKS\playcanvas\scripts\angle-finder\data\` 并 re-upload。

## Core Game Loop

```text
加载粗糙 splat（默认 off-angle，模糊/稀疏）
  → 玩家 orbit / 拖拽旋转
  → clarity score 随视角变化（峰值 = sourceCamera）
  → 视觉反馈：LOD/fog/密度衰减；近峰锐化揭示
  → 玩家提交猜测 → 胜利 / 失败 / 重试
```

## Scripts（Skill 工具）

| 脚本 | 用途 |
|------|------|
| `prepare_image_upload.py` | 校验/规范化用户图片 |
| `request_fast_gaussian_api.py` | 调用 fast API 或 dry-run 占位 |
| `build_clarity_curve.py` | 从 sourceCamera 生成 clarity 曲线 |
| `validate_angle_game_spec.py` | 校验 game-spec.json |
| `run_angle_game_simulation.py` | mock 案例端到端模拟 |

## Safety

- 禁止将 API Key 提交到 Git
- 用户图片与 splat 资产遵循项目隐私策略

## Distinction from labeled-gaussian-game-generator

| 维度 | 找角度游戏 | labeled-gaussian-game-generator |
|------|-----------|--------------------------------|
| 运行时 | **PlayCanvas orbit** | PlayCanvas FPS + billboards |
| 输入质量 | 粗糙单视角（预期） | 较完整 labeled splat |
| 核心循环 | 找角度 → 识别 | 语义标签 → 多机制玩法 |
| 相机 | orbit / 旋转 splat | FPS / 固定视角行走 |
