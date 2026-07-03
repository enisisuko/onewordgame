---
name: 找角度游戏
description: 找角度游戏 / Angle Finder Game — 从粗糙单视角 Gaussian 生成可玩的「找最佳观察角度」识别游戏。图片上传 → 公司 Fast Gaussian API → 环绕相机 → 清晰度揭示 → 猜测 → 胜负判定。Generate playable find-the-best-viewing-angle identification game from rough single-view Gaussian.
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

- 完整 labeled splat 场景 + 多机制玩法（收集、逃生、钓鱼等）→ 用 `labeled-gaussian-game-generator`
- 用户需要自由行走、语义标签驱动的复杂交互
- 用户只要技术预览、无游戏目标

## Required Inputs

| 输入 | 必需 | 说明 |
|------|------|------|
| 用户场景图片 | ✓ | 提交给 fast Gaussian API 的源图 |
| 正确答案标签 | ✓ | 物体/场景名称（来自用户或 API `subject_label`） |
| Fast Gaussian API 配置 | ✓ | 环境变量或本地 config JSON |
| API 返回资产 | ✓ | sog/ply、splat URL、metadata（含 source camera） |

## Image Input & Upload

```bash
python .cursor/skills/找角度游戏/scripts/prepare_image_upload.py path/to/photo.jpg
python .cursor/skills/找角度游戏/scripts/request_fast_gaussian_api.py output-angle-game/input/source-image.jpg \
  --output-dir output-angle-game/assets --dry-run
python .cursor/skills/找角度游戏/scripts/build_clarity_curve.py output-angle-game/assets/gaussian-metadata.json \
  --output output-angle-game/generated/clarity-curve.json
```

## Pipeline Workflow

```text
用户图片 → prepare_image_upload.py → request_fast_gaussian_api.py
  → build_clarity_curve.py → game-spec.json
  → output-angle-game/ (index.html + js/) → 本地 serve 测试
```

## Core Game Loop

```text
加载粗糙 splat（默认 off-angle，模糊/稀疏）
  → 玩家 orbit / 拖拽旋转
  → clarity score 随视角变化（峰值 = sourceCamera）
  → 视觉反馈：离峰模糊、噪声、密度衰减；近峰锐化揭示
  → 玩家提交猜测 → 胜利 / 失败 / 重试
```

## Playable Runtime

可运行原型位于 `output-angle-game/`：

```bash
cd output-angle-game
python -m http.server 8080
# 打开 http://localhost:8080
```

文件结构：

```text
output-angle-game/
├── index.html
├── js/
│   ├── main.js
│   ├── OrbitCamera.js
│   ├── ClaritySystem.js
│   ├── GuessUI.js
│   └── GaussianLoader.js
├── assets/
│   └── gaussian-metadata.json
└── generated/
    ├── clarity-curve.json
    └── game-spec.json
```

## Scripts

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
| 输入质量 | 粗糙单视角（预期） | 较完整 labeled splat |
| 核心循环 | 找角度 → 识别 | 语义标签 → 多机制玩法 |
| 相机 | orbit / 旋转 splat | FPS / 固定视角行走 |
