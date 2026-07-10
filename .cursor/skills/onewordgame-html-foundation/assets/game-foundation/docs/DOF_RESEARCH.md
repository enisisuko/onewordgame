# Depth of Field Research — Splat-Safe Hybrid

> Phase 1 research for HTML + Three.js + Spark Gaussian splat runtime.  
> Constraint: splats do not write reliable per-pixel depth → cannot use `tDepth` CoC like standard pipelines.

## Summary Table

| Source | Focal distance | CoC model | Blur kernel | Near / far | Multi-pass | Applies to splats |
|--------|----------------|-----------|-------------|------------|------------|-------------------|
| **BSL Shaders** (`program/composite3.glsl`) | Screen-point depth sample or manual `DOF_FOCUS_DISTANCE` | `abs(linZ - linFocus) / (linZ * linFocus)` then `coc / sqrt(coc² + 0.625)` | 60 offsets × mip LOD | Unified (hand depth excluded) | Single composite pass | **CoC formula + normalization**; focal from CPU raycast |
| **Complementary** (`program/composite3.glsl`) | `centerDepthSmooth` or fixed `WB_DOF_FOCUS` | `abs(z1 - centerDepth) * 0.125 * WB_DOF_I` then `coc / sqrt(coc² + 0.1)` | 18 hex offsets × LOD | Distance blur vs DOF modes | Single composite pass | **Center autofocus + sqrt normalize**; proxy depth instead of `z1` |
| **Sildur's Vibrant** (`program/composite3.glsl`) | Auto: `ld(centerDepthSmooth)*far`; manual: `DoF_MaxFocalPoint` | Strength slider × depth delta (mode-dependent) | Multi-tap in composite chain | Auto / Manual / Manual+ modes | Composite passes | **Raycast center focus**; manual offset slider |
| **Three.js BokehShader** | Uniform `focus` (view Z) | `factor = focus + viewZ` → blur radius | 29–41 fixed disk taps | Sign via view Z | Single pass | **Blur kernel layout only** — needs depth |
| **Unreal Engine** (`DepthOfFieldCommon.usf`) | `DepthOfFieldFocalDistance` + optional focal region | `Aperture * F * abs(P - D) / (D * (P - F))` or transition-region norm | Gaussian / bokeh tiles, near tile classify | Focal region + near/far transitions | Many passes | **Focal region (clear zone) + near/far transitions** |
| **Unity HDRP** | Physical camera or manual near/far ranges | Physical lens CoC or manual range ramps | Layered gather, ring occlusion | Separate near/far blur layers | Multi-pass | **Near/far split + max blur radius** |
| **Bevy post_process** (`dof.wgsl`) | `focal_distance` uniform | `scale * abs(depth - focus) / (depth * max(focus - f, ε))` | Separable Gaussian or hexagonal bokeh | Unified (depth-based) | 2+ passes | **Thin-lens CoC** with proxy `objectDist` |
| **pmndrs postprocessing** | `focusDistance` + `focusRange` | `smoothstep(0, focusRange, abs(dist - focus))` signed near/far in RG | Kawase blur on CoC buffer | R=near, G=far channels | Multi-pass | **Signed near/far CoC** concept; Kawase for blur |

---

## Minecraft Shader Packs (≥3)

### 1. BSL Shaders

**Files:** `program/composite3.glsl` (mirror: [swayam-mishra/BSL](https://github.com/swayam-mishra/BSL/blob/main/program/composite3.glsl)), settings in `shaders.properties` (`DOF_STRENGTH`, `DOF_FOCUS_MODE`, …).

**Focal distance:**
- Mode 0: sample `depthtex1` at `DOF_FOCUS_X/Y` (screen point, usually center).
- Mode 1/2: manual distance or brightness-scaled manual+.

**CoC:**
```glsl
float coc = abs(linZ - linFocus) / (linZ * linFocus);
coc = max(coc * DOF_STRENGTH * 1.0 - 0.025, 0.0);
coc = coc / sqrt(coc * coc + 0.625);
```

**Blur:** 60 precomputed offset directions, radius `coc * 0.015 * fovScale`, `textureLod` with `log2` mip for wide kernels.

**Near vs far:** Same formula; hand geometry excluded via depth compare.

---

### 2. Complementary Shaders (Reimagined)

**Files:** `shaders/program/composite3.glsl` ([ComplementaryDevelopment/ComplementaryReimagined](https://github.com/ComplementaryDevelopment/ComplementaryReimagined/blob/main/shaders/program/composite3.glsl)), HUD sliders `WB_DOF_I`, `WB_DOF_FOCUS`.

**Focal distance:**
- `WORLD_BLUR == 2`: depth-of-field mode.
- `centerDepthSmooth` from Iris uniform (smoothed center depth) or fixed `WB_DOF_FOCUS` meters.

**CoC:**
```glsl
float coc = max(abs(z1 - centerDepthSmooth) * 0.125 * WB_DOF_I - 0.0001, 0.0);
coc = coc / sqrt(coc * coc + 0.1);
```

**Blur:** 18-offset hex pattern, chromatic / anamorphic optional, LOD sampling.

**Near vs far:** Mode 1 = distance blur (`lViewPos0`); Mode 2 = true DOF on depth delta.

---

### 3. Sildur's Vibrant Shaders

**Files:** `shaders/program/composite3.glsl` (documented in community patches), `shaders.properties` `DOF_SCREEN`.

**Focal distance:**
```glsl
#ifdef smoothDof
  float focus = ld(centerDepthSmooth) * far;
#else
  float focus = ld(texture2D(depthtex0, vec2(0.5)).r) * far;
#endif
```
Modes: Auto (center), Manual (`DoF_MaxFocalPoint`), Manual+ (brightness-scaled).

**CoC / blur:** `DoF_Strength` scales blur; hyperfocal-aware mix in reference `final.fsh` forks separates near (stronger) vs far blur with cursor depth.

**Takeaway for splats:** Center-screen autofocus + artist strength slider maps to our raycast focus + bokeh strength UI.

---

## Third-Party Implementations (≥3)

### 1. Three.js BokehPass / BokehShader

**Files:** `examples/jsm/shaders/BokehShader.js`.

**Model:** Linearize depth → view Z; `factor = focus + viewZ`; `dofblur = clamp(factor * aperture, -maxblur, maxblur)`.

**Blur:** Single-pass 29–41 disk samples (Martin Upitis layout).

**Limitation for splats:** Requires `tDepth` per pixel — fails when splats skip depth buffer.

---

### 2. Unreal Engine

**Files:** `Engine/Shaders/Private/DepthOfFieldCommon.usf` (UE source mirrors).

**CoC (physical):**
```hlsl
float CoCRadius = Aperture * F * abs(P - D) / (D * (P - F));
```
**Artist controls:** `DepthOfFieldFocalRegion` (in-focus band), `NearTransitionRegion` / `FarTransitionRegion` for ramp to full blur.

**Blur:** Tile-based near/far classification, bokeh gather, Gaussian mobile path.

**Takeaway:** Focal region ≈ our `clearZone` (default 3× eye height ≈ 1.395 m).

---

### 3. Unity HDRP Depth of Field

**Docs:** [HDRP DoF manual](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/Post-Processing-Depth-of-Field.html).

**Modes:** Physical camera (aperture, focal length) or manual near/far start/end distances.

**CoC:** Lens-based or `abs(depth - focus) / transition` for manual mode.

**Blur:** Separate near/far sample counts and max radii; CoC pyramid for large kernels.

---

### Additional references

| Name | Notes |
|------|-------|
| **Bevy `dof.wgsl`** | Wikipedia thin-lens CoC + separable Gaussian / hex bokeh |
| **pmndrs `DepthOfFieldEffect`** | CoC RT (R=near, G=far) + Kawase blur |
| **Martins Upitis bokeh 2.4** | Physical `abs(a-b)*c` or manual near/far ramps |
| **GPU Gems 3 Ch.28** | Near CoC dilation, premultiplied alpha composite |
| **Kawase dual filter** | 2-pass expanding offset blur — used in pmndrs, mobile pipelines |

---

## Splat-Safe Hybrid (adopted)

| Technique | Source | Adaptation |
|-----------|--------|------------|
| Center raycast focus | Sildur / Complementary / BSL mode 0 | `PostProcessing.updateFocus()` — unchanged |
| Thin-lens CoC `|D-F|/(D·F)` | BSL, Bevy, UE | `objectDist` from **proxy** not `tDepth` |
| Near + far proxy distances | UE transitions, Upitis manual | `objectDistFar = F·(1+rad·div)`, `objectDistNear = F·(1-rad·div·w)` |
| Focal clear band | UE focal region | `clearZone` default 1.395 m (3× eye 0.465 m) |
| CoC normalize `coc/sqrt(coc²+k)` | BSL, Complementary | Stabilizes wide blur, avoids harsh full-screen |
| Separable 5-tap Gaussian | Bevy, Kawase family | 2 internal passes (H then V) vs 29-tap single pass |
| Radial divergence proxy | Prior splat-safe pass | Periphery estimates farther scene depth without depth buffer |

**Not adopted (depth required):** per-pixel depth gather, CoC pyramid tiling, bokeh hexagon 60-tap LOD, chromatic aberration on CoC.

---

## Tuning (debug panel)

| Control | Maps to | Default |
|---------|---------|---------|
| 射线对焦 readout | CPU focus distance (m) | ~8 m |
| 对焦偏移 | `focusOffset` | 0 |
| 焦平面清晰带 | `clearZone` (UE focal region) | 1.395 m |
| 虚化过渡 | `falloff` (transition width) | 1.0 |
| 径向边缘 | `radialEdge` vignette blur | 0.45 |
| 深度发散 | `divergence` proxy strength | 0.35 |
| HUD 虚化滑条 | `aperture` + `maxblur` | 50% medium |

---

## Files

- Implementation: `js/DepthOfFieldPass.js`, `js/PostProcessing.js`
- Sync: `output-angle-game/`, `dist/aquarium-fishing/`

*Research completed before Phase 2 shader rewrite — Jul 2026.*
