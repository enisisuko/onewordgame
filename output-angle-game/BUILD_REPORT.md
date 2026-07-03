# 找角度游戏 — BUILD REPORT

## 输入

- **模式**: dry-run 占位（无真实 Fast Gaussian API 调用）
- **目标标签**: 咖啡杯
- **难度**: normal
- **平台**: mobile_web

## 产物

| 文件 | 状态 |
|------|------|
| `output-angle-game/index.html` | ✓ 可运行 |
| `output-angle-game/js/*.js` | ✓ 完整实现 |
| `generated/clarity-curve.json` | ✓ 250 samples |
| `generated/game-spec.json` | ✓ 已校验 |
| `assets/gaussian-metadata.json` | ✓ dry-run 占位 |

## 运行时

- **引擎**: Three.js (CDN) — 占位点云模拟粗糙 Gaussian splat
- **真实 .sog**: 未接入（待 API 返回后替换 GaussianLoader）
- **Orbit**: 鼠标/触摸拖拽 + 滚轮缩放
- **Clarity**: 基于 sourceCamera 角距离 Gaussian 衰减
- **猜测**: 四选一多选 + 计时器 + 提示 + 重开

## 启动

```bash
cd output-angle-game
python -m http.server 8080
# http://localhost:8080
```

## 假设与降级

- 无真实 splat 资产，使用螺旋点云占位
- `angle-feasibility.suitable=true`，保持 angle_orbit 模式
- 正确答案在前端 game-spec 中（生产环境应服务端校验）

## 测试

- [x] `build_clarity_curve.py` PASS
- [x] `validate_angle_game_spec.py` PASS
- [x] `run_angle_game_simulation.py` 三案例 PASS
- [x] HTTP 200 本地 serve
- [x] JS 模块加载无 404
