# Minecraft 同款自动对焦景深（DOF）改造操作文档

> 项目：`output-angle-game`
>
> 目标：把当前 **splat-safe 风格化景深**，逐步升级为 **尽可能接近 Minecraft 光影包的自动对焦景深**。

---

## 1. 文档目的

这份文档不是研究笔记，而是**落地操作手册**。

适用场景：

- 你已经有当前版本的景深实现；
- 你希望它从“边缘氛围模糊”升级成“更像 Minecraft 光影的自动对焦景深”；
- 你接受分阶段改造，而不是一次性重写整个渲染系统。

---

## 2. 先说结论

如果目标是：

> **尽最大可能接近 Minecraft 光影那种自动对焦 + 真实前后景深层次**

那么必须明确：

### 2.1 当前版本不是“真实深度景深”

当前实现位于：

- `output-angle-game/js/PostProcessing.js`
- `output-angle-game/js/DepthOfFieldPass.js`

当前方案特点：

- 对焦：屏幕中心射线测距；
- CoC：大量依赖 `radial`（离屏幕中心多远）；
- 模糊：分离式 5-tap Gaussian；
- 不依赖 splat per-pixel depth。

因此它更准确的描述是：

> **splat-safe 风格化 DOF**

而不是：

> **Minecraft/BSL/Complementary 那种真实中心深度自动对焦 DOF**

---

## 3. Minecraft 光影的核心逻辑是什么

想做同款，先统一目标。

典型 Minecraft 光影包（BSL / Complementary / Sildur）里的自动对焦 DOF，核心逻辑通常是：

1. **取屏幕中心真实深度**；
2. 转成线性距离，得到 `focusDistance`；
3. 对屏幕上每个像素，用它自己的 `sceneDepth` 与 `focusDistance` 比较；
4. 按深度差计算 CoC；
5. 对 near / far 做不同过渡与 blur；
6. 保留一个清晰焦平面区域（clear zone / focal region）；
7. 边缘氛围只是辅助，不是主来源。

### 核心一句话

> **Minecraft 风格景深的主体来自深度差，不来自屏幕边缘位置。**

---

## 4. 当前项目中真正的难点

当前项目主场景使用：

- `GaussianLoaderV2.js`
- Spark Gaussian splat 渲染

问题不在于 shader 写不出来，而在于：

### 4.1 splat 深度不可靠

在当前实现注释里已经明确写了：

- `output-angle-game/js/DepthOfFieldPass.js:10`
- `output-angle-game/js/PostProcessing.js:17`

意思是：

- splat 往往不写可靠 depth buffer；
- 传统 `tDepth` / `DepthTexture` DOF 会失效；
- 所以你才做了现在这套 splat-safe proxy DOF。

### 4.2 因此“完全同款”做不到一步到位

如果没有真实 per-pixel depth：

- 你可以做得**很像**；
- 但不能百分百复刻 Minecraft 那种真实 center-depth autofocus。

所以本项目正确目标应分成两层：

#### 层 A：短期目标
做出 **尽可能像 Minecraft 光影的自动对焦观感**。

#### 层 B：长期目标
如果未来能拿到 splat 真实深度，再升级成 **真正 depth-driven 的同款 DOF**。

---

## 5. 当前代码现状梳理

### 5.1 对焦入口

文件：`output-angle-game/js/PostProcessing.js`

关键行为：

- `updateFocus()`：每帧更新焦距；
- `_measureFocusDistance()`：测屏幕中心前方最近目标；
- 当前目标来源：
  - `raycastTargets`
  - splatRoot 的 `Box3`
  - ground plane
  - 默认距离 fallback

### 5.2 CoC 计算入口

文件：`output-angle-game/js/DepthOfFieldPass.js`

核心函数：

- `computeCoC(vec2 uv)`

当前思路：

- 屏幕中心附近视为更接近焦平面；
- 越靠边缘，假定场景越远 / 越近；
- 再叠加 `farBoost` 和 `radialEdge`；
- 最终得到一个 unsigned coc。

### 5.3 现阶段最大问题

当前最大问题不是 blur kernel，而是：

> **CoC 的主要来源仍然是 radial proxy，不是真实场景深度差。**

这会直接导致：

- 画面更像“边缘糊”；
- 自动对焦感不强；
- 和 Minecraft 光影的逻辑有根本差异。

---

## 6. 改造总路线

建议分三阶段推进。

---

# 阶段 1：先把当前版本从“假糊”改成“像自动对焦”

## 6.1 目标

在不重构渲染架构的前提下，先让当前版本：

- 减少屏幕边缘糊感；
- 强化焦点存在感；
- 更像“看哪对哪”的自动对焦；
- 为后续 proxy depth 改造打基础。

## 6.2 要改哪些文件

- `output-angle-game/js/PostProcessing.js`
- `output-angle-game/js/DepthOfFieldPass.js`

## 6.3 必做项

### A. 焦点平滑改成 dt-based

当前：

- `PostProcessing.js` 用固定每帧 `lerp`
- 不同帧率手感不一致

建议：

- 参考 `CameraEffects.js` 的 `expSmoothAlpha(rate, dt)` 做法；
- 把 autofocus 平滑改成和帧率无关。

### B. 降低 `radialEdge`

当前 `radialEdge` 过强，会造成：

- 四周天然发糊；
- DOF 更像 vignette blur；
- 自动对焦被掩盖。

目标：

- `radialEdge` 只保留很轻的镜头氛围；
- 不再作为主要 CoC 来源。

### C. 基本关掉或大幅降低 `farBoost`

当前远景 haze 叠得偏重。建议先做一次对照测试：

1. 关闭 `farBoost`；
2. 观察 autofocus 本体还能否成立；
3. 若成立，再极轻量恢复氛围项。

### D. 缩窄默认 `clearZone`

当前默认清晰带偏宽，会导致：

- 大片区域“半清晰”；
- 真正焦外不明显；
- 最后只能靠 radial 项补效果。

建议：

- 让焦平面更明确；
- 让前后层次更容易被看见。

### E. 降低“中心天然清晰”的权重

当前设计里，中心区域更容易被默认视作焦点附近。

这在视觉上会让人误以为“对焦成立了”，但其实很多时候只是：

- 中心区域被放宽；
- 边缘区域被额外糊掉。

目标：

- 让中心清晰来自“真的命中焦点对象”；
- 不是来自“UV 靠近 0.5,0.5”。

## 6.4 阶段 1 完成标准

完成后你应该看到：

- 画面不再明显像边缘滤镜；
- 中心对焦更可信；
- 转头时焦点变化更自然；
- DOF 仍然是近似方案，但味道更接近 Minecraft。

---

# 阶段 2：引入 DOF 代理几何（推荐主路线）

这是整个改造里**最值得做**的一步。

## 7.1 目标

在拿不到 splat 真深度的前提下，构建一套 **DOF 专用的代理深度来源**。

即：

> 不改主画面呈现方式，但为景深系统单独补一套“可对焦、可测距、可渲染 depth”的代理几何。

## 7.2 为什么这一步关键

现在 autofocus 里 splat 只用的是包围盒：

- `PostProcessing.js` 里对 `splatRoot` 做 `Box3` 相交。

这会造成：

- 看向空洞结构时提前对焦；
- 对焦不贴表面；
- 模型大而稀疏时焦点飘。

而一旦引入代理几何，你就能得到：

- 更真实的中心命中点；
- 更稳定的 focusDistance；
- 更接近 Minecraft 那种“中心看到哪，就对哪里”。

## 7.3 代理几何应该包含什么

建议为场景补这些类型的简化对象：

### 必选

- 地面 / 平台表面
- 主要码头、墙面、礁石轮廓
- 大型可见主体
- 主要近景遮挡物

### 可选

- 水面近似层
- 护栏 / 牌子 / 近景边界
- 玩家经常注视的高频对象

## 7.4 代理几何的要求

代理几何不需要高精度。

要求只有三条：

1. **位置对**
2. **大轮廓对**
3. **能给出比 Box3 更可信的中心命中深度**

也就是说：

- 宁可少而准；
- 不要做成和美术主模型一样重；
- 它是给 DOF 服务的，不是给画面服务的。

## 7.5 代理几何放哪里

建议两种方式二选一：

### 方式 A：主 scene 中隐藏可 raycast 对象

优点：

- 实现简单；
- 可快速验证 autofocus 提升。

缺点：

- 后面做 depth prepass 时还要再组织一次。

### 方式 B：单独的 `dofProxyScene`

优点：

- 后续可直接渲染 proxy depth；
- 结构更清晰。

缺点：

- 初期代码多一点。

### 建议

如果你确定要继续做阶段 3，建议直接走 **方式 B**。

---

# 阶段 3：渲染 proxy depth texture（最接近 Minecraft 的现实方案）

## 8.1 目标

让当前 DOF 不再主要依赖 radial proxy，而是依赖：

- 中心真实代理深度；
- 全屏代理深度；
- 基于代理深度差的 CoC。

## 8.2 这是最值得追求的升级点

这是当前项目里，最接近 Minecraft 光影逻辑、同时又不要求你彻底重写 Spark 的路线。

一句话：

> **主画面仍然是 splat，但 DOF 的“深度认知”改由 proxy depth texture 提供。**

## 8.3 新增系统结构

建议新增：

- `dofProxyScene`
- `proxyDepthRenderTarget`
- `proxyDepthMaterial` 或 depth-only pass
- `centerDepthSampler`（可 CPU/可 shader）

## 8.4 执行流程

每帧顺序建议如下：

1. 更新玩家相机；
2. 渲染 splat 主画面；
3. 另外渲染一次代理几何深度图；
4. 用代理深度中心值更新 autofocus；
5. 在 DOF pass 中用代理深度参与 CoC 计算；
6. 输出最终画面。

## 8.5 代理深度图的作用

### 作用 1：真实中心 autofocus

代替当前：

- `raycaster + Box3 + ground plane`

改为：

- 直接采样屏幕中心 depth；
- 再转线性距离；
- 做平滑；
- 得到 focusDistance。

### 作用 2：全屏 CoC 计算

代替当前：

- `radial` 推断 objectDistNear / objectDistFar

改为：

- 每像素采样 `proxyDepth`
- 线性化成 `sceneDepth`
- 与 `focusDistance` 比较
- 算 near/far coc

这样就从“边缘糊”升级成了“深度差糊”。

---

## 8.6 推荐的 CoC 思路

目标不是 100% 物理镜头，而是：

- 逻辑像 Minecraft
- 参数好调
- 对代理深度误差足够宽容

推荐保留这几个思想：

### A. 焦平面清晰带（clear zone）

用途：

- 避免焦点附近一抖就突然糊；
- 模拟 Minecraft/UE/Complementary 风格里的清晰区域。

### B. near / far 分离

用途：

- 前景和背景的模糊层次不同；
- 更接近真实景深观感。

### C. CoC normalize

用途：

- 避免全屏突然爆糊；
- 让强度滑条更好调。

### D. radial 只做风格项

保留可以，但必须降级为：

- 轻微镜头氛围
- 不是主要 CoC 来源

---

# 9. 推荐实施顺序

这是建议你实际施工时的顺序。

## 第一步：先做无风险验证

只改当前参数与逻辑，不上新架构。

执行内容：

1. 降低 `radialEdge`
2. 关闭或显著降低 `farBoost`
3. 缩窄 `clearZone`
4. 把 focus smoothing 改成 dt-based

验证目的：

- 看当前视觉里，到底有多少是真 autofocus；
- 看多少效果只是靠屏幕边缘模糊撑起来的。

## 第二步：引入 focus proxy

执行内容：

1. 为场景加一批 DOF 代理几何；
2. 先只服务于中心 raycast autofocus；
3. 替换 Box3 对焦。

验证目的：

- 看“看哪对哪”的感觉是否明显增强；
- 看焦点是否更贴可见表面。

## 第三步：上 proxy depth pass

执行内容：

1. 新增代理深度 render target；
2. 每帧渲染代理深度；
3. 从中心采样 depth 做 autofocus；
4. 在 `DepthOfFieldPass` 中接入 `tProxyDepth`。

验证目的：

- 让 CoC 开始真正由“深度差”驱动；
- 这是最接近 Minecraft 的质变。

## 第四步：再做风格调参

执行内容：

- 调 clear zone
- 调 near/far falloff
- 调 aperture / maxblur
- 只保留轻量 radial stylistic 项

目的：

- 在真实逻辑已经成立的基础上，才去追“味道像不像”。

---

# 10. 文件级改造建议

## 10.1 `output-angle-game/js/PostProcessing.js`

### 当前职责

- 初始化 composer / passes
- 维护 focusDistance
- 中心 raycast autofocus
- 管理调试参数与质量档位

### 建议新增职责

- 管理 `dofProxyScene`
- 管理 `proxyDepthRenderTarget`
- 渲染 proxy depth
- 提供中心 depth autofocus 更新

### 建议保留职责

- 质量档位
- HUD 调试滑条映射
- 焦点平滑管理

---

## 10.2 `output-angle-game/js/DepthOfFieldPass.js`

### 当前职责

- 根据 focus / radial proxy 计算 coc
- 做 H/V 双 pass blur

### 建议升级职责

- 接入 `tProxyDepth`
- 支持 depth linearization
- 支持 near/far coc 分离
- radial 项降级为辅助风格项

### 建议不动的部分

- 现有分离式 5-tap blur 框架可以先保留
- 先改 CoC 来源，不必一开始就重写 blur kernel

---

## 10.3 `output-angle-game/js/main.js`

### 当前职责

- 主场景初始化
- 初始化 `PostProcessing`
- 每帧更新 player / game loop / dof ui

### 建议新增职责

- 创建或装配 DOF 代理对象
- 把代理对象交给 `PostProcessing`
- 若使用独立 proxy scene，则在 init 阶段完成 wiring

---

## 10.4 `output-angle-game/js/GaussianLoaderV2.js`

### 当前职责

- splat 资源加载
- 视觉参数调整

### 说明

当前 `setDepthWrite()` 存在，但全局未接入实际流程。

这说明目前项目还没有真正走 depth-driven splat DOF。这个函数暂时不应被误认为“已经支持真实景深”。

如果未来 Spark 能稳定输出深度，这个文件可能成为升级入口之一；否则短期内不建议把阶段 3 依赖押在这里。

---

# 11. 推荐验收标准

## 阶段 1 验收

- 转头时焦点变化平滑
- 画面四周不再天然重糊
- 中心对焦更明显
- 焦平面存在感增强

## 阶段 2 验收

- 焦点更贴近真实可见物体
- 看向空洞区域时不再频繁误对焦到 AABB
- 近景主体对焦稳定性明显提升

## 阶段 3 验收

- blur 主因是深度差，而不是屏幕位置
- 看远景时背景自然糊，中心与边缘不会无理由一起糊
- 看近景遮挡物时前景糊更合理
- 自动对焦行为明显接近 Minecraft 光影

---

# 12. 调参建议

当你完成阶段 3 后，再开始认真调这些参数：

## 12.1 焦点类

- `focus smoothing rate`
- `focusOffset`
- `clearZone`

## 12.2 景深强度类

- `aperture`
- `maxblur`
- `nearWeight`
- `falloff`

## 12.3 风格辅助类

- `radialEdge`
- `farBoost`

### 调参原则

> 先把“对焦逻辑”调对，再去调“风格味道”。

不要反过来。

---

# 13. 不推荐做法

以下做法不建议继续加码。

## 13.1 继续提高 radialEdge 期待更像 Minecraft

不会更像，只会更像滤镜。

## 13.2 用更多屏幕半径推断替代深度

这只能让画面更“假 cinematic”，不能更同款。

## 13.3 在 Box3 对焦基础上继续细调大量参数

收益有限，因为数据源本身太粗。

## 13.4 先重写重型 bokeh kernel

优先级不高。当前最大问题不是 kernel，而是 CoC 来源。

---

# 14. 最终建议

如果你要一个最直接的决策建议：

## 现在就应该做什么

### 立刻做

1. 先收敛当前 `radialEdge / farBoost / clearZone`
2. 把 autofocus smoothing 改成 dt-based
3. 引入 DOF 代理几何

### 接着做

4. 新增 proxy depth pass
5. 把 CoC 改成基于 proxy depth 的 depth-driven 逻辑

### 最后做

6. 按 Minecraft 光影的观感去调 near/far / clear zone / blur strength

---

# 15. 一句话路线图

> **短期：让现在的 DOF 不再像边缘糊。**
>
> **中期：用代理几何让 autofocus 真正“看哪对哪”。**
>
> **长期：用 proxy depth texture 把 CoC 从 radial 驱动升级成 depth 驱动。**
>
> **只有做到这一步，才算真正走上“尽可能同款 Minecraft 光影 DOF”的路线。**

---

# 16. 关联文件

- 研究说明：`output-angle-game/docs/DOF_RESEARCH.md`
- 当前 DOF 管线：`output-angle-game/js/PostProcessing.js`
- 当前 DOF Pass：`output-angle-game/js/DepthOfFieldPass.js`
- 主循环接线：`output-angle-game/js/main.js`
- splat 加载：`output-angle-game/js/GaussianLoaderV2.js`
- 相机平滑参考：`output-angle-game/js/CameraEffects.js`

---

# 17. 文档用途建议

这份文档建议作为：

- 技术改造总说明；
- 开发排期依据；
- 后续实现阶段的 checklist；
- 向团队解释“为什么现在这版不像 Minecraft 光影”的统一口径。
