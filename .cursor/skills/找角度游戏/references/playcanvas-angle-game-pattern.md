# PlayCanvas Angle Game Pattern（主运行时）

**找角度游戏的默认运行时是 PlayCanvas，不是 standalone HTML。**  
本地脚本源：`C:\WORKS\playcanvas\scripts\angle-finder\`

## 项目 / 场景

| 项 | 值 |
|----|-----|
| Project ID | **1557749**（找角度专用） |
| Scene ID | **2540280** |
| Branch ID | `a71cf48d-4898-4899-9afe-ac50b5739a97` |
| Launch | https://playcanvas.com/editor/scene/2540280 |

> 赌场副本 1551971 / scene 2532760 是另一套 cloud-patched 项目，不要混用 upload 脚本。

## Scene Hierarchy

```text
Root
├── Camera                 (angleOrbitCamera — 禁用 cameraControls)
├── GaussianSplat          (gsplat + gsplatLoader + clarityController)
└── GameManager            (uiLayoutBoot + angleGameManager + angleGuessUi)
```

## 脚本与 Asset ID

| 脚本 | Asset ID | 挂载实体 |
|------|----------|----------|
| ui-layout.js | 297185092 | GameManager (uiLayoutBoot) |
| angle-orbit-camera.js | 297185093 | Camera |
| clarity-controller.js | 297185094 | GaussianSplat |
| gsplat-loader.js | 297185095 | GaussianSplat |
| angle-game-manager.js | 297185096 | GameManager |
| angle-guess-ui.js | 297185097 | GameManager |
| gaussian-metadata.json | 297185098 | loader + clarity + manager |
| game-spec.json | 297185099 | manager |
| clarity-curve.json | 297185100 | loader + clarity |

## 上传

```bash
cd C:\WORKS\playcanvas
# .env 需 PLAYCANVAS_API_TOKEN
node scripts/upload-angle-finder.mjs
```

优先 REST API；MCP（port 52001）用于实体/属性微调。

## angle-game-manager 状态机

```text
loading → intro → playing → won | lost → restarting → playing
```

| 事件 | 说明 |
|------|------|
| `angle:state` / `game:state` | 状态广播 |
| `angle:orbit` | 相机角度变化（clarity 监听） |
| `clarity:changed` | 清晰度更新 → UI 进度条 |
| `angle:guess_submit` | 多选答案 |
| `game:hint` | 提示 → clarity boost |
| `game:timeout` | 超时失败 |
| `angle:restart_request` | 重来 |

## Orbit Camera

- **仅 orbit**，禁用 `cameraControls`
- 鼠标左键 / 单指触摸拖拽
- `UiLayout.isPointerOverCanvasUI` 时忽略（不抢 UI 点击）
- 属性：`pivot` vec3、`startYawDeg`、`startPitchDeg`、`radius`

## Clarity

- 视角向量 vs `sourceCamera` 真值方向 → Gaussian 峰
- 驱动：GSplat LOD、`scene fog`、placeholder scale
- 公式见 `references/clarity-model.md`

## Guess UI

- Canvas2D + `UiLayout` / `UiTheme`（竖屏 720×1280）
- 多选题、计时器、清晰度条、提示/重置/再来一局
- 底部 1/3 拇指区放选项

## GSplat 加载

1. 有 `gsplatAsset` → 挂 `gsplat` component
2. 无资产 → `gsplatLoader` 生成 placeholder 点云（dry-run）
3. API 返回 `.sog` 后上传到 PlayCanvas 并赋给 `gsplatAsset`

## 测试清单

1. Launch → 拖拽环绕，清晰度条上升
2. 转到峰值附近 → 猜「咖啡杯」→ 胜利
3. 连续错 3 次 → 失败
4. 等计时器归零 → 失败
5. 手机竖屏 / 触摸 orbit 正常

## output-angle-game/（仅开发回退）

`output-angle-game/` 是 Three.js 本地原型，用于 API/曲线调试。**不是交付运行时。**  
需要快速验逻辑时用 `python -m http.server`，正式 demo 走 PlayCanvas Launch。

## 与 labeled-gaussian-game-generator 区别

| 维度 | 找角度 | labeled explorer |
|------|--------|------------------|
| 相机 | orbit only | FPS + billboard pick |
| 输入 | 拖拽环绕 | 行走 + 交互距离 |
| UI | Canvas2D 猜题 | 世界 billboard |
