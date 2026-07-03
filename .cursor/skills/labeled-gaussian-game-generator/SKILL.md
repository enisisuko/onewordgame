---
name: labeled-gaussian-game-generator
description: Generate a playable game from a user-provided image and a one-sentence game request by calling the project's existing Gaussian-generation API, consuming semantic scene labels, converting the labels into a semantic scene graph, binding game mechanics to labeled objects and surfaces, generating the game project, and testing the complete gameplay loop. Use when the user asks to turn an image, photo, Gaussian scene, labeled splat scene, or semantic 3D reconstruction into a game. Do not use for ordinary image generation, manual 3D modeling, or Gaussian reconstruction algorithm development.
---

# Labeled Gaussian Game Generator

## Purpose

从用户上传的场景图片和一句自然语言游戏需求出发，调用**项目中已有的图片转高斯 API**，获取高斯场景、相机、碰撞与语义标签；将标签整理为 Semantic Scene Graph；根据标签与用户意图设计可玩的完整小游戏（含胜负条件）；生成游戏工程、测试并输出构建报告。

**禁止**在 Skill 内实现高斯重建算法，**禁止**安装 SHARP、COLMAP 或其他重建工具。

## When to Use

- 用户提供场景图片 + 一句话游戏需求（如「一分钟内在厨房找五种食材放进锅里」）
- 用户要把 Gaussian / labeled splat / 语义 3D 重建场景变成可玩游戏
- 项目已有高斯生成 API，需要消费 `labels_url`、`collision_url` 等输出

## When Not to Use

- 普通文生图、手动建模、高斯算法研发
- 仅查看高斯场景、无游戏目标的技术演示
- 未配置 API 且无法从项目发现客户端时（应先配置或询问凭证）

## Required Inputs

1. 用户场景图片
2. 一句话游戏需求
3. 高斯 API 配置（环境变量或项目配置文件）
4. API 返回的资产与标签（或异步 task 完成后的下载结果）
5. 可选：深度、碰撞、相机、尺度信息

## Existing API Discovery

**必须先**在项目中查找，不得自建第二套流程：

- API 客户端、配置、环境变量（如 `GAUSSIAN_API_URL`、`GAUSSIAN_API_KEY`）
- 请求脚本、接口文档、类型定义、示例响应

异步流程：`提交图片 → task_id → 轮询 → completed → 下载全部结果`

API Key：只从环境变量/本地配置读取；禁止写入前端、Git 或完整日志。

## Gaussian API Workflow

```text
用户图片 + 游戏需求
  → scripts/request_gaussian_api.py（或项目既有客户端）
  → sog / ply / collision / metadata / labels
  → output-game/assets/
```

推荐输出字段见 `references/gaussian-api-contract.md`。

## Semantic Label Contract

标签结构见 `references/semantic-label-contract.md` 与 `schemas/scene-labels.schema.json`。

验证：`python scripts/validate_scene_labels.py output-game/assets/scene-labels.json`

## Semantic Scene Graph

下载标签后生成 `output-game/generated/semantic-scene.json`：

```bash
python scripts/build_semantic_scene.py output-game/assets/scene-labels.json --output output-game/generated/semantic-scene.json
```

每个实体需包含：`id`、`semanticType`、`position`、`bounds`、`confidence`、`affordances`、`gameRoles`、`relations`。

关系类型：`inside`, `contains`, `on_top_of`, `near`, `connected_to`, `blocks`, `supports`, `reachable_from` 等。

## Label Confidence Rules

| confidence | 用途 |
|------------|------|
| ≥ 0.85 | 核心玩法 |
| 0.60–0.85 | 次要玩法，需空间/视觉验证 |
| 0.40–0.60 | 仅候选，不可作唯一胜利条件 |
| < 0.40 | 忽略（除非有其他证据） |

验证：包围盒尺度、imageBounds、相邻标签、碰撞射线。

## Affordance Inference

按 `references/label-mechanic-mapping.md` 将标签映射为玩法能力（地面→行走、门→出口、食材→收集、水域→钓鱼等）。不得把标签当纯文本；必须转为场景实体与 `gameRoles`。

## 总体架构（禁止从一句话直接生成代码）

必须经过以下中间层，每层产出可检查 JSON：

```text
用户一句话
  → game-intent.json          (parse_game_intent.py)
  → genre-routing.json        (route_game_genre.py)
  → semantic-scene.json       (build_semantic_scene.py)
  → scene-capabilities.json   (analyze_scene_capabilities.py)
  → mechanic-graph.json       (build_mechanic_graph.py)
  → mechanic-bindings.json
  → fallback-plan.json
  → design-review.json        (generate_design_review.py)
  → state-machine.json        (build_state_machine.py)
  → camera-plan.json / control-plan.json / ui-plan.json
  → game-spec.json
  → solvability-report.json   (verify_solvability.py)
  → quality-score.json
  → Runtime Implementation
  → Automated Verification
```

`design-review.json` 中 `approved: true` 后方可进入代码生成。

## Game Design Extraction

从一句话解析 explicit vs inferred intent，写入 `game-intent.json`。区分硬性要求、软偏好、假设与歧义。缺信息时采用最简单可玩解释，记录在 `assumptions` 与 `BUILD_REPORT.md`。

通用语法见 `references/game-grammar.md`（动词 / 世界对象 / 目标 / 失败 / 反馈）。

## Mechanic Feasibility Scoring

```bash
python scripts/score_mechanic_feasibility.py output-game/generated/scene-capabilities.json pickup delivery --output output-game/generated/mechanic-scores.json
```

核心机制 score < 0.65 必须降级或替换。阈值见 Skill 规范。

## Mechanic-to-Object Binding

生成 `mechanic-bindings.json`：每个核心机制绑定真实 `semantic_object` / `surface` / `region` 或验证过的锚点。

禁止：墙当收集品、低置信度标签作唯一胜利目标、无依据随机坐标。

实体来源：`semantic_scene` | `api_generated` | `synthetic_gameplay` | `ui_only`（合成物须在报告中说明）。

## Anchor Resolution

锚点类型：`semantic_object`, `semantic_surface`, `semantic_region`, `collision_point`, `image_uv`, `camera_relative`, `generated_safe_anchor`。

优先级：3D 中心/包围盒 → 碰撞/表面 → imageBounds 射线 → 深度反投影 → 相机相对 → 屏幕空间。

## Collision and Navigation

有 `collision.glb`：作静态碰撞，不渲染；结合 `walkable` 标签与 floor 生成可行走区与安全边界。

无碰撞：可用简化代理并记录来源；不可盲目从高斯外观推断精确碰撞。

无法可靠自由移动时降级：`full_3d → limited_3d → fixed_view_2_5d → screen_space`。

## Playability Modes

见 `references/playability-modes.md`。根据 `scene-capabilities.json` 与 `camera-plan.json` 选择视角。

## Fallback Strategy

每个核心机制在 `fallback-plan.json` 中预定义降级链。冲突检测：

```bash
python scripts/detect_mechanic_conflicts.py --playability limited_3d --mechanics pickup delivery free_movement
```

## PlayCanvas Runtime

当目标工程或模板使用 PlayCanvas（默认）时，运行时实现应对齐 `C:\WORKS\playcanvas\scripts\`（`cloud-patched\` 与 `fishing\`）：

- **FPS 探索**：`gameManager` + `character-controller`
- **世界交互（两种范式）**：
  - **路标 + 接触触发**（`worldMarker`，`scripts/fishing/`）：空间内几个路标，玩家走入球形 trigger / 邻近距离即 `app.fire('marker:touch', {type, marker})` — 对应「空间内几个路标和接触触发的事件」
  - **广告牌射线拾取**（`billboardUi`，`scripts/cloud-patched/`）：瞄准点击，`GameManager.interactDistance`（默认 12）内命中
- **竖屏 UI**：`UiLayout.createScreen` + `createCanvasPanel` + Canvas2D 绘制（720×1280）
- **内置小游戏（逻辑闭环）**：poker / pachinko / sleep（casino）、fishing / roast / rest / shop（fishing）；每个都是 `openSession → 阶段状态机（下注→进行→结算→重开/退出）→ 回到 fps` 的闭环 — 对应「几个游戏 UI 和逻辑闭环」

生成物绑定语义标签时：可走入的地面对象用 **`worldMarker`**（自建 sphere trigger），需远距点选的竖直招牌用 **`billboardUi`**（`interactionType` + `interactDistance`）。选择规则与代码级契约见 `references/playcanvas-interaction-pattern.md`；锚点→路标→事件→模式→UI 的端到端接线见 `references/playcanvas-scene-wiring.md`。

## PlayCanvas MCP Connection

编辑器内场景摆放优先 PlayCanvas MCP；**脚本上传优先 REST API**（`upload-cloud-patched.mjs` + `.env` token，勿提交密钥）。

**前置条件**：

1. Cursor **Agent 模式**
2. `~/.cursor/mcp.json` 中 `playcanvas` 指向 `editor-mcp-server`（port **52000**）
3. PlayCanvas Editor 打开目标 scene，Chrome 扩展点击 **CONNECT**

**MCP 失败时**（如 empty-window 会话、未 CONNECT）：

- 改本地 `scripts/cloud-patched/` 后 `node scripts/upload-cloud-patched.mjs`
- 参考 `references/playcanvas-mcp-workflow.md` 中的 asset ID 与 project 1551971 / 1552576 对照
- 实体坐标仍可从 `semantic-scene.json` 手写或通过 helper 脚本（`mcp-setup-world-markers.mjs`）批量创建

## Interaction Range Placement

从 `mechanic-bindings.json` / 语义图节点到场景实体：

1. 取标签 3D 中心 + 高度偏移（约 1.5–2 m）
2. 按 `references/label-mechanic-mapping.md` 与下表设 `interactionType`：

| 语义类型示例 | interactionType |
|-------------|-----------------|
| table, casino_table | `poker` |
| pachinko, slot_machine | `pachinko` |
| bed, couch, rest_area | `sleep` |

3. MCP（广告牌）：`list_entities` → `create_entities` → `add_components`（element）→ `add_script_component_script`（billboardUi）→ `modify_entities`（设 interactionType）
4. 校验：Launch 后准星/点击能在 `interactDistance` 内命中；HUD 底部出现 `CLICK · POKER` 等提示

**路标 + 接触触发（推荐用于可走入的地面对象）**：用 `worldMarker`（`scripts/fishing/world-marker.js`）。
最小 MCP footprint：`create_entities`（锚点空实体）→ `add_script_component_script`（worldMarker）→ `modify_entities`
设 `interactionType`/`triggerRadius`/`labelText`；脚本会自建 sphere **trigger**（MCP schema 无 `trigger` 字段，勿手写碰撞）+ 标签 + 网格。
玩家走入即 `marker:touch`。完整调用序列与两种范式对照见 `references/playcanvas-scene-wiring.md`。

## UI Minigame Integration

模式机：`fps` | `poker` | `pachinko` | `sleep`（+ fishing 的 `shop`）。

事件总线（`app.fire` / `app.on`）：

- `game:enterPoker` / `game:enterPachinko` / `game:enterSleep`
- `game:uiMode` — 当前模式字符串

**能量 / 金币门控**：

- 进入 poker、pachinko：消耗 **1 energy**（不足 → toast `ENERGY LOW`）
- sleep：免费，完成后 `restoreEnergy(maxEnergy)`
- 小游戏内下注：`spendGold` / `canAfford`（默认 initialGold 100，bet 5–100）

实现新玩法时优先 **复用现有 mini-game 壳** + 换 Canvas2D 文案/规则，而非绕过 GameManager 直接改 mode。详见 `references/playcanvas-ui-minigame-pattern.md`。

## PlayCanvas Runtime

当目标工程使用 PlayCanvas（默认）时，运行时实现应对齐 `C:\WORKS\playcanvas\scripts\cloud-patched\` 模式，而非从零写通用 Three.js 循环。

| 模块 | 脚本 | 职责 |
|------|------|------|
| 模式 / 经济 | `gameManager` | FPS 探索、`interactDistance`、energy/gold、模式机 |
| 世界交互 | `billboardUi` | 射线拾取 + `interactionType` → 小游戏 |
| UI 基建 | `ui-layout.js` | 720×1280 竖屏 Canvas、`createScreen` / `createCanvasPanel` |
| 小游戏 | `pokerGame`, `pachinkoGame`, `sleepTransition` | 监听 `game:enter*` 事件 |
| 可选 | `shopGame` | 钓鱼项目 `game:enterShop` |

生成 `output-game/` 时：

1. 复用机制注册表与事件总线命名（`game:uiMode`, `game:enterPoker` 等）
2. 语义锚点 → `billboardUi` 实体（见 Interaction Range Placement）
3. 小游戏 UI 用 `UiLayout` 面板模式（见 UI Minigame Integration）
4. 详细契约见 `references/playcanvas-interaction-pattern.md` 与 `references/playcanvas-ui-minigame-pattern.md`

## PlayCanvas MCP Connection

编辑器内放置实体、挂脚本组件时使用 PlayCanvas MCP；**脚本文件上传优先 REST API**。

**前置条件**

- Cursor **Agent** 模式
- `~/.cursor/mcp.json` 中 `playcanvas` 服务（`tsx` 启动 `editor-mcp-server`，`PORT=52000`）
- PlayCanvas Editor 打开正确 scene，Chrome 扩展 **CONNECT**

**失败回退**

| 失败 | 处理 |
|------|------|
| MCP 不可用（如无 playcanvas 服务） | 用手动编辑器操作 + `upload-cloud-patched.mjs` |
| `list_entities` 超时 | 确认扩展 CONNECT、scene URL 与 project ID 一致 |
| empty-window 会话无 MCP | 在用户主 `mcp.json` 配置 playcanvas 后重启；或仅走 REST + 本地 `cloud-patched` 参考 |

完整工具列表与工作流：`references/playcanvas-mcp-workflow.md`  
项目 ID：**1551971**（主场景 casino）、**1552576**（副本 / 钓鱼）。

## Interaction Range Placement

将 `mechanic-bindings.json` 中的可交互语义对象落到 PlayCanvas 场景：

1. 取标签 `position` / 包围盒中心作为 billboard 世界坐标
2. 设置 `billboardUi.interactionType`（`poker` | `pachinko` | `sleep`）与 `labelText`
3. 保证与玩家站立点距离 ≤ `GameManager.interactDistance`（默认 **12**）
4. MCP：`list_entities` → `list_assets` → `create_entities` → `add_components` + `add_script_component_script`
5. 钓鱼类场景可改用 `worldMarker` 邻近触发（`scripts/fishing/`），见 interaction pattern 文档

语义标签映射示例：table→`poker`，bed/sofa→`sleep`，arcade/slot→`pachinko`。

## UI Minigame Integration

小游戏不直接由 billboard/marker 打开 UI，而由 **GameManager 事件**驱动（两条入口同源）：

```text
worldMarker 接触 → marker:touch{type,marker} → _onMarkerTouch → _tryMarkerAction(type)
billboardUi 点击 → _triggerAimInteract
  → start<Mode>()（fishing|roast|rest|shop 或 poker|pachinko|sleep）
  → 资源检查（energy/gold/satiety，sleep/rest 免）→ lockPlayer → setMode
  → app.fire('game:enter<Mode>')
  → <Mode>Game.openSession() 启用 UiLayout Screen + Canvas 面板（闭环状态机）
  → 退出/完成 → app.fire('game:exit*') → gm.setMode('fps') + unlockPlayer
```

实现新 PlayCanvas 小游戏时：

- Screen priority 高于 HUD（110+），`useInput: true` 的面板用 `UiLayout.bindPanelInput`
- 退出时 `gm.setMode('fps')` + `gm.unlockPlayer()`
- 投注类玩法用 `gm.spendGold` / `gm.addGold`；进入消耗用 `gm.spendEnergy(1)`

详见 `references/playcanvas-ui-minigame-pattern.md`。

## Game Generation

1. 检查项目技术栈（默认 PlayCanvas 或项目现有运行时）
2. 输出目录：

```text
output-game/
├── assets/
├── generated/
├── src/
├── public/
├── tests/
├── BUILD_REPORT.md
└── README.md
```

3. 机制注册表（组合而非重写）：

```javascript
const mechanicRegistry = {
  pickup: createPickupMechanic,
  delivery: createDeliveryMechanic,
  timer: createTimerMechanic,
  unlock: createUnlockMechanic,
  enemyPatrol: createEnemyPatrolMechanic,
  fishing: createFishingMechanic,
  // PlayCanvas 空间交互 + UI 闭环（对齐 scripts/fishing + cloud-patched）
  waypointMarker: createWaypointMarkerMechanic, // worldMarker：球形 trigger + 邻近距离 → app.fire('marker:touch', {type, marker})
  canvasMinigame: createCanvasMinigameMechanic, // UiLayout Screen 面板：openSession → 阶段状态机 → game:enter*/exit* → 回到 fps
};
```

- **`waypointMarker`**（接触触发）：在锚点放置 `worldMarker` 实体；每个路标持有一个 `interactionType`，玩家走入
  即发 `marker:touch`（0.3s 去抖，仅 `fps` 模式）。GameManager 以 `marker.entity.getGuid()` 做 0.5s 冷却并路由到 `start<Mode>()`。
- **`canvasMinigame`**（闭环 UI）：一个模式对应一个 `UiLayout` Screen 面板，`app.on('game:enter<Mode>')` 打开
  `openSession()`，跑「开始→进行→胜/负→重开/退出」闭环，退出时 `gm.setMode('fps') + unlockPlayer()`。
  实现新玩法优先复用此壳并替换 Canvas2D 规则，而非新增 mode 或绕过 GameManager。
- 二者组合即「几个路标 + 几个 UI 闭环」：详见 `references/playcanvas-scene-wiring.md`。

4. 事件总线：`game:won`, `item:picked`, `objective:completed`, `timer:expired`、以及 PlayCanvas 的
   `marker:touch` / `marker:exit` / `game:enter*` / `game:exit*` / `game:uiMode`；机制间勿直接改内部状态。

5. 配方库：`recipes/*.json` — 只定义最小结构、场景证据、必测项与降级路线。

6. 模块结构（按需生成，勿建空文件）：`src/core/`, `src/scene/`, `src/gameplay/`, `src/mechanics/`, `src/ui/`, `src/main.js`

## Testing

四层测试：

1. **静态**：Schema、ID 唯一、状态机、无 API Key 泄露 — `python scripts/run_all_validations.py`
2. **场景**：高斯/碰撞/标签加载、锚点、可行走区
3. **玩法模拟**：收集、投递、胜负、重启 — `validate_game_loop.py`, `validate_restart.py`
4. **运行时**：启动游戏、控制台无错、胜利/失败/重开

类型专用验证器：`validators/validate_*.py`

模拟测试：

```bash
python scripts/run_simulation_tests.py
```

## Build Report

自 `templates/BUILD_REPORT.md` 生成 `output-game/BUILD_REPORT.md`，包含：User Request、Selected Game Design、Gaussian Assets、Semantic Labels Used、Mechanic Bindings、Rejected Labels、Generated Objects、Fallbacks、Tests、Known Limitations。

## Safety Rules

- 不提交 API Key；不将用户图片上传到未配置第三方
- 不假装完整实现 MMO、开放世界、完整水下世界等不可实现需求
- 范围过大时生成 3–5 分钟垂直切片并在报告中说明删减

## Final Verification Checklist

- [ ] 使用现有高斯 API，未自行重建
- [ ] 获取并验证语义标签
- [ ] 生成 Semantic Scene Graph 与 game-intent / genre-routing / mechanic-graph
- [ ] 核心机制绑定真实场景对象，检查 confidence
- [ ] 使用真实坐标/碰撞/深度，无随机关键物 placement
- [ ] 完整循环：输入、目标、反馈、胜负、重开、基础 UI
- [ ] design-review approved，solvability == true，quality overall ≥ 0.75
- [ ] 启动测试并生成 BUILD_REPORT.md

## Quick Commands

```bash
# 全量验证（Schema、语法、配方、冲突、模拟）
python .cursor/skills/labeled-gaussian-game-generator/scripts/run_all_validations.py

# 单步示例
python scripts/parse_game_intent.py "厨房找五种食材放进锅里" --output output-game/generated/game-intent.json
python scripts/route_game_genre.py output-game/generated/game-intent.json --output output-game/generated/genre-routing.json
```

## Additional References

- `references/semantic-label-contract.md`
- `references/label-mechanic-mapping.md`
- `references/playability-modes.md`
- `references/gaussian-api-contract.md`
- `references/game-grammar.md`
- `references/genre-routing.md`
- `references/mechanic-primitives.md`
- `references/mechanic-conflicts.md`
- `references/playcanvas-interaction-pattern.md` — 两种范式：BillboardUi 射线拾取 + WorldMarker 路标接触触发（`marker:touch`）、`interactDistance`、标签→interactionType、trigger/proximity/ray-pick 选择
- `references/playcanvas-ui-minigame-pattern.md` — 模式机（casino + fishing）、事件总线、UiLayout 面板、闭环状态机、能量/金币门控
- `references/playcanvas-scene-wiring.md` — 锚点→路标→事件→模式→UI 闭环端到端接线 + 具体 MCP 调用序列（create_entities / add_script_component_script / modify_entities）
- `references/playcanvas-mcp-workflow.md` — MCP 前置、23 工具、摆放流程、REST 上传与 project ID
