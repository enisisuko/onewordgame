---
name: angle-finder-gaussian-game
description: Generate a playable "find the best viewing angle" identification game from a rough single-view Gaussian reconstruction. Use when the user has fast/rough Gaussian output from one canonical angle and wants a rotation/orbit puzzle where the player discovers what the scene is. Do NOT use for full labeled-scene multi-mechanic games (use labeled-gaussian-game-generator instead).
---

# Angle Finder Gaussian Game

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
- 高斯过于对称、无明确 canonical angle 且用户拒绝降级为多选揭示

## Required Inputs

| 输入 | 必需 | 说明 |
|------|------|------|
| 用户场景图片 | ✓ | 提交给 fast Gaussian API 的源图 |
| 正确答案标签 | ✓ | 物体/场景名称（来自用户或 API `subject_label`） |
| 游戏需求（可选） | | 难度、时限、旋转预算、是否允许多选降级 |
| Fast Gaussian API 配置 | ✓ | 环境变量或本地 config JSON |
| API 返回资产 | ✓ | sog/ply、splat URL、metadata（含 source camera） |

可选增强：错误选项列表、提示文案、移动端触控偏好。

## Existing API Discovery

**必须先**在项目中查找，不得自建第二套重建流程：

- API 客户端、配置、环境变量（如 `FAST_GAUSSIAN_API_URL`、`GAUSSIAN_API_KEY`）
- 请求脚本、接口文档、类型定义、示例响应
- 与 `labeled-gaussian-game-generator` 共享的 Gaussian 客户端模式

异步流程：`提交图片 → task_id → 轮询 → completed → 下载 sog + metadata`

API Key：只从环境变量/本地配置读取；**禁止**写入前端、Git 或完整日志。见 `references/fast-gaussian-api-contract.md`。

## Fast Gaussian API Workflow

```text
用户图片 + 识别游戏需求
  → scripts/request_fast_gaussian_api.py（或项目既有 fast 客户端）
  → sog / ply + gaussian-metadata.json
  → scripts/build_clarity_curve.py
  → clarity-curve.json
  → angle-feasibility.json（是否适合角度谜题）
  → game-spec.json + ui-plan.json
  → PlayCanvas runtime
  → BUILD_REPORT.md
```

## Core Game Loop

```text
加载粗糙 splat（默认 off-angle，模糊/稀疏）
  → 玩家 orbit / 拖拽旋转
  → clarity score 随视角变化（峰值 = sourceCamera）
  → 视觉反馈：离峰模糊、噪声、密度衰减；近峰锐化揭示
  → 玩家提交猜测 OR 达到 clarity 阈值后确认识别
  → 胜利 / 失败 / 重试
```

### Player Verbs

| 动词 | 输入 | 说明 |
|------|------|------|
| orbit | 鼠标拖拽 / 触摸滑动 | 环绕 centroid 旋转相机或旋转 splat 实体 |
| zoom | 滚轮 / 双指捏合（可选） | 拉近观察细节 |
| guess | 文本输入 / 多选按钮 | 提交识别答案 |
| hint | 按钮（可选） | 消耗 hint 预算，显示类别或首字母 |
| reset | 按钮 | 恢复初始角度与猜测次数 |

### Angle Mechanics

两种实现模式（二选一，PlayCanvas 见 `references/orbit-controls.md`）：

1. **Orbit camera** — 相机绕 `centroid` 公转，splat 静止（推荐）
2. **Rotate splat** — 整个 splat 实体绕 Y 轴旋转，相机固定

**Clarity function**：以 API `sourceCamera` 为真值角度，计算当前视角与真值的角距离 Δθ，映射到 0–1 clarity。详见 `references/clarity-model.md`。

离峰视觉处理（可组合）：

- splat opacity / scale 衰减
- 后处理 blur 或 noise
- 离峰方向额外 Gaussian 扩散（视觉上的「糊」）

近峰（clarity ≥ threshold）：

- 锐化、提高 opacity
- 可选：短暂 slow-mo 或粒子「啊哈」反馈

### Optional Pressure

- **旋转预算**：累计角速度或拖拽距离超限则失败
- **计时器**：默认 60–120 秒移动端友好会话
- **错误猜测上限**：默认 3 次

## Win Conditions

满足其一即可胜利（在 `game-spec.json` 中配置）：

1. **correct_guess** — 玩家提交的标签与 `correctAnswer` 匹配（模糊匹配：忽略大小写、首尾空格）
2. **clarity_confirm** — clarity ≥ `clarityWinThreshold`（默认 0.85）且玩家点击「我认出来了」并答对
3. **clarity_reveal_then_guess** — 达到 clarity 阈值后解锁猜测 UI，答对即胜

## Fail Conditions

- 计时器归零
- 错误猜测次数达到 `maxWrongGuesses`
- 旋转预算耗尽（若启用）
- 玩家主动放弃

## Intermediate JSON Pipeline

禁止从一句话直接生成 PlayCanvas 代码。必须经过：

```text
用户图片 + 需求
  → game-intent.json
  → gaussian-metadata.json      （API：sourceCamera, centroid, bounds, sog_url）
  → angle-feasibility.json      （粗糙单视角是否可做角度谜题）
  → clarity-curve.json          （角度 → clarity 采样表）
  → game-spec.json
  → ui-plan.json                （猜测 UI、clarity 条、罗盘）
  → Runtime Implementation
  → BUILD_REPORT.md
```

### game-intent.json

```json
{
  "rawRequest": "做一个找角度的猜物体游戏",
  "correctAnswer": "咖啡杯",
  "difficulty": "normal",
  "sessionLengthSeconds": 90,
  "enableRotationBudget": false,
  "maxWrongGuesses": 3,
  "clarityWinThreshold": 0.85,
  "targetPlatform": "mobile_web"
}
```

### angle-feasibility.json

由 clarity 曲线与 metadata 评估：

| 字段 | 含义 |
|------|------|
| `suitable` | 是否适合角度谜题 |
| `peakClarity` | 峰值清晰度（应 ≥ 0.8） |
| `peakWidthDeg` | 峰值半宽（度），太宽则太简单 |
| `symmetryRisk` | 对称物体风险 0–1 |
| `recommendedMode` | `angle_orbit` \| `multi_choice_reveal` |

若 `suitable: false` 或 `symmetryRisk > 0.7`，**必须**降级为多选 + 渐进揭示（见 Fallback）。

### clarity-curve.json

由 `scripts/build_clarity_curve.py` 生成。Schema：`schemas/clarity-curve.schema.json`。

### game-spec.json

Schema：`schemas/angle-game-spec.schema.json`。验证：

```bash
python scripts/validate_angle_game_spec.py output-angle-game/generated/game-spec.json
```

## Fallback: Multi-Choice Gradual Reveal

当以下任一成立时启用：

- Gaussian 过于对称，多个角度 clarity 相近
- API 未返回 `sourceCamera`，且无法从 metadata 推断
- `angle-feasibility.json` → `suitable: false`

降级行为：

- 保留 orbit 作为「揭示进度」手段（clarity 仍随角度变化，但峰值区域更宽）
- 猜测改为 **4 选 1**（含正确答案 + 3 个干扰项）
- 干扰项从 `distractors` 或通用类别池生成
- 在 `BUILD_REPORT.md` 记录降级原因

## PlayCanvas Runtime

**首选运行时**：PlayCanvas（Loopit 合作、移动端触控成熟）。

参考：

- `references/playcanvas-angle-game-pattern.md`
- `references/orbit-controls.md`
- 兄弟 Skill：`labeled-gaussian-game-generator/references/playcanvas-interaction-pattern.md`

最小场景：

```text
Root
├── Camera                    (script: orbit-camera 或固定 + 旋转 SplatRoot)
├── DirectionalLight
├── SplatRoot                 (Gaussian splat 实体)
│   └── ClarityController     (根据 clarity 调 opacity/blur)
├── GameManager               (状态机、计时、胜负)
└── Screen                    (ui-plan: clarity meter, guess panel, compass)
```

触控：单指拖拽 = orbit；`touch-action: none` 防页面滚动。

## Distinction from labeled-gaussian-game-generator

| 维度 | angle-finder-gaussian-game | labeled-gaussian-game-generator |
|------|---------------------------|--------------------------------|
| 输入质量 | 粗糙单视角（预期） | 较完整 labeled splat |
| 核心循环 | 找角度 → 识别 | 语义标签 → 多机制玩法 |
| 语义场景图 | **不需要**（可选赛后提示） | **必需** |
| 相机 | orbit / 旋转 splat | FPS / 固定视角行走 |
| API | fast pipeline | full labeled pipeline |

两者可共享 `request_*_gaussian_api.py` 的配置发现模式，但产物与中间 JSON 管道不同。

## Recipe

默认配方：`recipes/angle-identification.json`

## Scripts

| 脚本 | 用途 |
|------|------|
| `request_fast_gaussian_api.py` | 调用 fast API，写出 metadata |
| `build_clarity_curve.py` | 从 sourceCamera + bounds 生成 clarity 曲线 |
| `validate_angle_game_spec.py` | 校验 game-spec.json |
| `run_angle_game_simulation.py` | 3 个 mock 案例端到端模拟 |

```bash
# 生成 clarity 曲线
python scripts/build_clarity_curve.py output-angle-game/assets/gaussian-metadata.json \
  --output output-angle-game/generated/clarity-curve.json

# 模拟测试
python scripts/run_angle_game_simulation.py
```

## Safety

- 禁止将 API Key 提交到 Git
- 日志中 key 仅显示前 4 字符
- 用户图片与 splat 资产遵循项目隐私策略
- 正确答案标签不得硬编码在公开前端（可做哈希比对或服务端校验）

## Testing Checklist

- [ ] `request_fast_gaussian_api.py` 在配置齐全时能写出 metadata 占位/真实响应
- [ ] `build_clarity_curve.py` 峰值落在 sourceCamera 方向
- [ ] `validate_angle_game_spec.py` 对合法/非法 spec 分别 PASS/FAIL
- [ ] `run_angle_game_simulation.py` 三个 mock 案例全部 PASS
- [ ] clarity 在离峰 < 0.3、近峰 > 0.85（可配置）
- [ ] 移动端单指拖拽 orbit 无页面滚动冲突
- [ ] 计时器、错误次数、旋转预算（若启用）正确触发失败
- [ ] 对称物体案例正确降级 multi_choice_reveal
- [ ] 重启后角度、计时、猜测次数重置
- [ ] BUILD_REPORT.md 记录降级与假设

## Final Verification Checklist

- [ ] 所有中间 JSON 文件存在且通过 schema 校验
- [ ] `angle-feasibility.json` 已评估并记录 `recommendedMode`
- [ ] PlayCanvas 场景可加载 sog 并在 orbit 时更新 clarity
- [ ] 胜利/失败 UI 与 `game-spec.json` 一致
- [ ] 无 API Key 泄露
- [ ] 与 labeled-gaussian-game-generator 无文件混用/覆盖
- [ ] `BUILD_REPORT.md` 完整：输入、假设、降级、测试结果

## Output Layout

```text
output-angle-game/
├── assets/
│   ├── gaussian-metadata.json
│   └── scene.sog                    （或 API 下载路径）
├── generated/
│   ├── game-intent.json
│   ├── angle-feasibility.json
│   ├── clarity-curve.json
│   ├── game-spec.json
│   └── ui-plan.json
└── BUILD_REPORT.md
```

模板见 `templates/BUILD_REPORT.md`。
