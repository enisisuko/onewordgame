import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DepthOfFieldPass } from './DepthOfFieldPass.js';
import { expSmoothAlpha } from './CameraEffects.js';
import { DEFAULT_EYE_HEIGHT } from './PlayerController.js';

/** 自适应对焦平滑衰减率（1/s），与帧率无关 */
const FOCUS_SMOOTH_RATE = 2.5;
/** 射线未命中时的默认对焦距离（米） */
const DEFAULT_FOCUS_DIST = 8.0;
/** 默认清晰区半径：收窄焦平面，避免大面积半清晰 */
export const DOF_DEFAULT_CLEAR_ZONE = DEFAULT_EYE_HEIGHT * 1.2;
/** 自动对焦采样：中心 + 9 条轻微错位射线，用稳健统计抵抗孤立浮空噪点 */
const FOCUS_SAMPLE_PATTERN = [
  { x: 0.0000, y: 0.0000, weight: 3.0 },
  { x: 0.0260, y: 0.0000, weight: 1.0 },
  { x: 0.0199, y: 0.0167, weight: 0.92 },
  { x: 0.0045, y: 0.0256, weight: 0.92 },
  { x: -0.0130, y: 0.0225, weight: 0.92 },
  { x: -0.0244, y: 0.0089, weight: 0.92 },
  { x: -0.0244, y: -0.0089, weight: 0.92 },
  { x: -0.0130, y: -0.0225, weight: 0.92 },
  { x: 0.0045, y: -0.0256, weight: 0.92 },
  { x: 0.0199, y: -0.0167, weight: 0.92 },
];

/**
 * EffectComposer splat-safe 景深 — 屏幕中心代理对焦 + Minecraft 式深度 CoC。
 *
 * Spark Gaussian splats 通常不写深度缓冲（或写入不一致）。Three.js BokehPass /
 * 基于 DepthTexture 的 per-pixel DOF 在 splat 场景会导致全屏虚化或黑屏。
 * 本模块使用独立 DOF 代理几何渲染 depth texture，不依赖 splat 自身深度。
 * 详见 docs/DOF_RESEARCH.md 与 DepthOfFieldPass.js 顶部注释。
 */
export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = false;

    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const ew = Math.max(1, Math.floor(size.width * pr));
    const eh = Math.max(1, Math.floor(size.height * pr));

    const renderTarget = new THREE.WebGLRenderTarget(ew, eh, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    renderTarget.texture.name = 'PostFX.color';

    this.composer = new EffectComposer(renderer, renderTarget);
    this.renderPass = new RenderPass(scene, camera);
    this.dofPass = new DepthOfFieldPass(camera);
    this.outputPass = new OutputPass();

    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.dofPass);
    this.composer.addPass(this.outputPass);

    this.dofProxyScene = new THREE.Scene();
    this.dofProxyRoot = null;
    this._dofProxyRenderableCount = 0;
    this._dofProxyRaycastTargets = [];
    this._proxyDepthClearColor = new THREE.Color();
    this._proxyDepthMaterial = this._createProxyDepthMaterial();
    this.dofProxyScene.overrideMaterial = this._proxyDepthMaterial;
    this.proxyDepthTarget = this._createProxyDepthTarget(ew, eh);
    this.dofPass.uniforms.tProxyDepth.value = this.proxyDepthTarget.texture;

    this._raycaster = new THREE.Raycaster();
    this._sampleNdc = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();
    this._boxPoint = new THREE.Vector3();
    this._box = new THREE.Box3();

    this.focus = DEFAULT_FOCUS_DIST;
    this._smoothedFocus = DEFAULT_FOCUS_DIST;
    this._dofDebug = {
      focusOffset: 0,
      clearZone: DOF_DEFAULT_CLEAR_ZONE,
      falloff: 1.0,
      radialEdge: 0.08,
      divergence: 0.12,
      nearWeight: 0.7,
      farBoost: 0.035,
      debugView: 0,
    };
    this._applyDofDebugUniforms();
    this.setQuality('medium');
    this._bokehStrength = null;
  }

  setEnabled(on) {
    this.enabled = !!on;
    this.dofPass.enabled = this.enabled;
  }

  setQuality(preset) {
    const table = {
      low: { aperture: 0.00018, maxblur: 4.5, radialEdge: 0.03, falloff: 1.1 },
      medium: { aperture: 0.0003, maxblur: 8.0, radialEdge: 0.05, falloff: 0.9 },
      high: { aperture: 0.00042, maxblur: 12.0, radialEdge: 0.08, falloff: 0.75 },
    };
    const q = table[preset] ?? table.medium;
    this.dofPass.uniforms.aperture.value = q.aperture;
    this.dofPass.uniforms.maxblur.value = q.maxblur;
    this._dofDebug.radialEdge = q.radialEdge;
    this._dofDebug.falloff = q.falloff;
    this._applyDofDebugUniforms();
    this._qualityPreset = preset;
    if (this._bokehStrength != null) {
      this.setBokehStrength(this._bokehStrength);
    }
  }

  /** 虚化强度滑条 0–1：0%≈清晰、50%=档位默认、100%=强景深 */
  setBokehStrength(strength) {
    const s = THREE.MathUtils.clamp(strength, 0, 1);
    this._bokehStrength = s;
    const preset = this._qualityPreset ?? 'medium';
    const apertureMed = { low: 0.00018, medium: 0.0003, high: 0.00042 }[preset] ?? 0.0003;
    const maxblurMed = { low: 4.5, medium: 8.0, high: 12.0 }[preset] ?? 8.0;
    const radialMed = { low: 0.03, medium: 0.05, high: 0.08 }[preset] ?? 0.05;

    const apertureMin = apertureMed * 0.06;
    const maxblurMin = 0.25;
    const radialMin = 0.0;
    const apertureMax = apertureMed * 3.2;
    const maxblurMax = 26.0;
    const radialMax = radialMed + 0.08;

    let aperture;
    let maxblur;
    let radialEdge;
    if (s <= 0.5) {
      const t = s / 0.5;
      aperture = THREE.MathUtils.lerp(apertureMin, apertureMed, t);
      maxblur = THREE.MathUtils.lerp(maxblurMin, maxblurMed, t);
      radialEdge = THREE.MathUtils.lerp(radialMin, radialMed, t);
    } else {
      const t = (s - 0.5) / 0.5;
      aperture = THREE.MathUtils.lerp(apertureMed, apertureMax, t);
      maxblur = THREE.MathUtils.lerp(maxblurMed, maxblurMax, t);
      radialEdge = THREE.MathUtils.lerp(radialMed, radialMax, t);
    }

    this.dofPass.uniforms.aperture.value = aperture;
    this.dofPass.uniforms.maxblur.value = maxblur;
    this._dofDebug.radialEdge = radialEdge;
    this._applyDofDebugUniforms();
  }

  /** 调试面板实时调参 */
  setDofDebugParams(params = {}) {
    if (params.focusOffset != null) this._dofDebug.focusOffset = params.focusOffset;
    if (params.clearZone != null) this._dofDebug.clearZone = params.clearZone;
    if (params.falloff != null) this._dofDebug.falloff = params.falloff;
    if (params.radialEdge != null) this._dofDebug.radialEdge = params.radialEdge;
    if (params.divergence != null) this._dofDebug.divergence = params.divergence;
    if (params.nearWeight != null) this._dofDebug.nearWeight = params.nearWeight;
    if (params.farBoost != null) this._dofDebug.farBoost = params.farBoost;
    if (params.debugView != null) this._dofDebug.debugView = params.debugView;
    this._applyDofDebugUniforms();
  }

  getDofDebugParams() {
    return { ...this._dofDebug };
  }

  getFocusDistance() {
    return this.focus;
  }

  getEffectiveFocusDistance() {
    return this.focus + this._dofDebug.focusOffset;
  }

  _applyDofDebugUniforms() {
    const u = this.dofPass.uniforms;
    u.focusOffset.value = this._dofDebug.focusOffset;
    u.clearZone.value = this._dofDebug.clearZone;
    u.falloff.value = this._dofDebug.falloff;
    u.radialEdge.value = this._dofDebug.radialEdge;
    u.divergence.value = this._dofDebug.divergence;
    u.nearWeight.value = this._dofDebug.nearWeight;
    u.farBoost.value = this._dofDebug.farBoost;
    u.debugView.value = this._dofDebug.debugView;
  }

  _createProxyDepthTarget(w, h) {
    const target = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.texture.name = 'DofProxy.linearDepth';
    return target;
  }

  _createProxyDepthMaterial() {
    return new THREE.ShaderMaterial({
      uniforms: {
        cameraNear: { value: this.camera.near },
        cameraFar: { value: this.camera.far },
      },
      vertexShader: /* glsl */`
        varying float vViewZ;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewZ = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float cameraNear;
        uniform float cameraFar;
        varying float vViewZ;
        void main() {
          float depth01 = clamp((vViewZ - cameraNear) / max(cameraFar - cameraNear, 0.0001), 0.0, 1.0);
          gl_FragColor = vec4(vec3(depth01), 1.0);
        }
      `,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
    });
  }

  setDofProxyRoot(root) {
    if (this.dofProxyRoot) {
      this.dofProxyScene.remove(this.dofProxyRoot);
    }

    this.dofProxyRoot = root ?? null;
    this._dofProxyRenderableCount = 0;
    this._dofProxyRaycastTargets = [];

    if (this.dofProxyRoot) {
      this.dofProxyScene.add(this.dofProxyRoot);
      this.dofProxyRoot.updateMatrixWorld(true);
      this.dofProxyRoot.traverse((obj) => {
        if (!obj.isMesh) return;
        this._dofProxyRenderableCount += 1;
        if (!this._isDofFocusIgnored(obj)) {
          this._dofProxyRaycastTargets.push(obj);
        }
      });
    }

    this.dofPass.uniforms.useProxyDepth.value = this._dofProxyRenderableCount > 0 ? 1 : 0;
  }

  _isDofFocusIgnored(obj) {
    let cur = obj;
    while (cur) {
      if (cur.userData?.dofIgnoreFocus) return true;
      if (cur === this.dofProxyRoot) break;
      cur = cur.parent;
    }
    return false;
  }

  _resizeProxyDepthTarget(width, height) {
    const pr = this.renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(width * pr));
    const h = Math.max(1, Math.floor(height * pr));
    this.proxyDepthTarget.setSize(w, h);
    this.dofPass.uniforms.tProxyDepth.value = this.proxyDepthTarget.texture;
  }

  _renderProxyDepth() {
    const hasProxy = this._dofProxyRenderableCount > 0;
    this.dofPass.uniforms.useProxyDepth.value = hasProxy ? 1 : 0;
    if (!hasProxy) return;

    this.dofProxyScene.updateMatrixWorld(true);
    const previousTarget = this.renderer.getRenderTarget();
    const previousAutoClear = this.renderer.autoClear;
    const previousClearAlpha = this.renderer.getClearAlpha();
    this.renderer.getClearColor(this._proxyDepthClearColor);

    this._proxyDepthMaterial.uniforms.cameraNear.value = this.camera.near;
    this._proxyDepthMaterial.uniforms.cameraFar.value = this.camera.far;
    this.renderer.autoClear = true;
    this.renderer.setClearColor(0xffffff, 1);
    this.renderer.setRenderTarget(this.proxyDepthTarget);
    this.renderer.clear(true, true, true);
    this.renderer.render(this.dofProxyScene, this.camera);
    this.renderer.setRenderTarget(previousTarget);
    this.renderer.setClearColor(this._proxyDepthClearColor, previousClearAlpha);
    this.renderer.autoClear = previousAutoClear;
    this.dofPass.uniforms.tProxyDepth.value = this.proxyDepthTarget.texture;
  }

  /**
   * 自适应对焦：屏幕中心 (0,0) NDC 射线 → 场景 mesh / splat 包围盒 / 地面 / 默认距离。
   * 使用 camera 当前位姿（含 CameraEffects 偏移后）。
   */
  updateFocus(splatRoot, raycastTargets = [], dt = 1 / 60) {
    const hitDist = this._measureFocusDistance(splatRoot, raycastTargets);
    const alpha = expSmoothAlpha(FOCUS_SMOOTH_RATE, Math.max(0, Math.min(dt, 0.1)));
    this._smoothedFocus = THREE.MathUtils.lerp(this._smoothedFocus, hitDist, alpha);
    this.focus = this._smoothedFocus;
    this.dofPass.uniforms.focus.value = this.focus;
  }

  _measureFocusDistance(splatRoot, raycastTargets) {
    this.camera.updateMatrixWorld(true);
    const centerTargets = [
      ...raycastTargets,
      ...this._dofProxyRaycastTargets,
    ];

    const candidates = [];
    for (let i = 0; i < FOCUS_SAMPLE_PATTERN.length; i++) {
      const sample = FOCUS_SAMPLE_PATTERN[i];
      const hit = this._measureFocusSample(sample, splatRoot, centerTargets);
      if (hit) {
        candidates.push({
          ...hit,
          isCenter: i === 0,
          weight: sample.weight * hit.sourceWeight,
        });
      }
    }

    return this._resolveFocusCandidates(candidates);
  }

  _measureFocusSample(sample, splatRoot, centerTargets) {
    this._sampleNdc.set(sample.x, sample.y);
    this._raycaster.setFromCamera(this._sampleNdc, this.camera);
    const ray = this._raycaster.ray;
    let nearest = Infinity;
    let sourceWeight = 1.0;

    if (centerTargets.length > 0) {
      this.dofProxyRoot?.updateMatrixWorld(true);
      const hits = this._raycaster.intersectObjects(centerTargets, true);
      for (const h of hits) {
        if (h.distance > 0.15 && h.distance < nearest) {
          nearest = h.distance;
          sourceWeight = 1.0;
        }
      }
    }

    if (splatRoot && this._dofProxyRaycastTargets.length === 0) {
      this._box.setFromObject(splatRoot);
      if (!this._box.isEmpty() && ray.intersectBox(this._box, this._boxPoint)) {
        const d = this.camera.position.distanceTo(this._boxPoint);
        if (d > 0.15 && d < nearest) {
          nearest = d;
          sourceWeight = 0.55;
        }
      }
    }

    if (ray.intersectPlane(this._groundPlane, this._hit)) {
      const d = this.camera.position.distanceTo(this._hit);
      if (d > 0.15 && d < nearest) {
        nearest = d;
        sourceWeight = 0.65;
      }
    }

    if (Number.isFinite(nearest)) {
      return {
        distance: THREE.MathUtils.clamp(nearest, 0.5, 30),
        sourceWeight,
      };
    }

    return null;
  }

  _resolveFocusCandidates(candidates) {
    if (candidates.length === 0) {
      return THREE.MathUtils.clamp(DEFAULT_FOCUS_DIST, 5, 15);
    }

    const weightedMedian = this._weightedMedianDistance(candidates);
    const tolerance = Math.max(0.45, weightedMedian * 0.18);
    const inliers = candidates.filter((c) => Math.abs(c.distance - weightedMedian) <= tolerance);
    const support = inliers.reduce((sum, c) => sum + c.weight, 0);
    const hasCenterSupport = inliers.some((c) => c.isCenter);

    if (support < 1.3 && !hasCenterSupport) {
      return THREE.MathUtils.clamp(DEFAULT_FOCUS_DIST, 5, 15);
    }

    const weightedDistance = inliers.reduce((sum, c) => sum + c.distance * c.weight, 0) / support;
    return THREE.MathUtils.clamp(weightedDistance, 0.5, 30);
  }

  _weightedMedianDistance(candidates) {
    const sorted = [...candidates].sort((a, b) => a.distance - b.distance);
    const halfWeight = sorted.reduce((sum, c) => sum + c.weight, 0) * 0.5;
    let running = 0;
    for (const c of sorted) {
      running += c.weight;
      if (running >= halfWeight) {
        return c.distance;
      }
    }
    return sorted[sorted.length - 1].distance;
  }

  setSize(w, h) {
    this.composer.setSize(w, h);
    this._resizeProxyDepthTarget(w, h);
  }

  render() {
    if (this.enabled) {
      this._renderProxyDepth();
      this.composer.render();
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.composer.dispose();
    this.proxyDepthTarget.dispose();
    this._proxyDepthMaterial.dispose();
    this.dofProxyRoot?.userData?.dispose?.();
  }
}
