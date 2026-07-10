import {
  HalfFloatType,
  LinearFilter,
  ShaderMaterial,
  UniformsUtils,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Splat-safe cinematic DOF with optional proxy depth.
 *
 * Spark Gaussian splats are particle clouds that often skip or inconsistently
 * write the depth buffer. Depth-based BokehPass / DepthTexture DOF reads
 * tDepth per pixel; when splats contribute no depth, every pixel shares the
 * same wrong depth → uniform huge CoC → full-screen blur / invisible splats.
 *
 * This pass samples a separate DOF proxy depth texture when available. The
 * visible image still comes from the splat scene; the DOF "depth awareness"
 * comes from lightweight proxy meshes.
 *
 * Research-backed hybrid (see docs/DOF_RESEARCH.md):
 * - BSL / Bevy thin-lens CoC: |D−F| / (D·F) with proxy scene depth
 * - UE / Complementary focal clear band (clearZone) + transition falloff
 * - Near/far split from scene depth; radial divergence is only fallback/style
 * - BSL/Complementary coc normalize: coc / sqrt(coc² + k)
 * - Separable 5-tap Gaussian blur (2 internal passes) vs legacy 29-tap disk
 *
 * Default clearZone is intentionally narrow so the focal plane reads clearly.
 */

const SHARED_UNIFORMS = {
  focus: { value: 8.0 },
  focusOffset: { value: 0.0 },
  aspect: { value: 1.0 },
  aperture: { value: 0.0003 },
  maxblur: { value: 8.0 },
  clearZone: { value: 0.56 },
  falloff: { value: 0.95 },
  radialEdge: { value: 0.05 },
  divergence: { value: 0.12 },
  nearWeight: { value: 0.7 },
  farBoost: { value: 0.035 },
  tProxyDepth: { value: null },
  useProxyDepth: { value: 0 },
  cameraNear: { value: 0.1 },
  cameraFar: { value: 100.0 },
  debugView: { value: 0 },
  texelSize: { value: new Vector2(1, 1) },
};

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const COC_GLSL = /* glsl */`
  float linearizeProxyDepth(float depthSample) {
    return mix(cameraNear, cameraFar, clamp(depthSample, 0.0, 1.0));
  }

  vec3 heatmapColor(float x) {
    x = clamp(x, 0.0, 1.0);
    vec3 cold = vec3(0.0, 0.02, 0.12);
    vec3 blue = vec3(0.0, 0.45, 1.0);
    vec3 gold = vec3(1.0, 0.68, 0.0);
    vec3 white = vec3(1.0);
    vec3 low = mix(cold, blue, smoothstep(0.0, 0.35, x));
    vec3 high = mix(gold, white, smoothstep(0.65, 1.0, x));
    return mix(low, high, smoothstep(0.35, 0.8, x));
  }

  vec3 proxyDepthColor(vec2 uv) {
    if (useProxyDepth < 0.5) {
      return vec3(0.7, 0.0, 0.9);
    }

    float proxyDepth = texture2D(tProxyDepth, uv).x;
    if (proxyDepth >= 0.9999) {
      return vec3(0.95, 0.0, 0.85);
    }

    float meters = linearizeProxyDepth(proxyDepth);
    float nearViz = 1.0 - smoothstep(cameraNear, min(cameraFar, 26.0), meters);
    vec3 farColor = vec3(0.02, 0.08, 0.32);
    vec3 nearColor = vec3(0.0, 1.0, 0.72);
    vec3 midColor = vec3(1.0, 0.72, 0.08);
    vec3 color = mix(farColor, nearColor, nearViz);
    color = mix(color, midColor, smoothstep(0.18, 0.28, nearViz) * (1.0 - smoothstep(0.45, 0.65, nearViz)));
    return color;
  }

  float depthDrivenCoC(float sceneDepth, float focalDepth) {
    float depthDelta = sceneDepth - focalDepth;
    float farDelta = max(depthDelta - clearZone, 0.0);
    float nearDelta = max(-depthDelta - clearZone * 0.75, 0.0);
    float transition = max(focalDepth * 0.12, 0.06);

    float rampFar = (farDelta > 0.0)
      ? smoothstep(0.0, max(falloff, 0.05), farDelta / transition)
      : 0.0;
    float rampNear = (nearDelta > 0.0)
      ? smoothstep(0.0, max(falloff * 0.85, 0.05), nearDelta / transition)
      : 0.0;

    float cocBase = abs(depthDelta) / max(sceneDepth * focalDepth, 0.01);
    float nearScale = mix(0.75, 1.55, clamp(nearWeight, 0.0, 1.0));
    float sideScale = (depthDelta < 0.0) ? nearScale * rampNear : rampFar * 1.18;
    float coc = cocBase * sideScale;

    coc *= aperture * 1250.0;
    return coc / sqrt(coc * coc + 0.055);
  }

  float radialProxyCoC(float radial, float focalDepth) {
    float div = divergence * radial * 0.55;

    float objectDistFar = focalDepth * (1.0 + div);
    float objectDistNear = max(focalDepth * (1.0 - div * nearWeight), 0.1);

    float cocFar = abs(objectDistFar - focalDepth) / max(objectDistFar * focalDepth, 0.01);
    float cocNear = abs(objectDistNear - focalDepth) / max(objectDistNear * focalDepth, 0.01);

    float deltaFar = max(objectDistFar - focalDepth - clearZone, 0.0);
    float deltaNear = max(focalDepth - objectDistNear - clearZone * 0.75, 0.0);
    float transition = max(focalDepth * 0.14, 0.06);
    float rampFar = (deltaFar > 0.0)
      ? smoothstep(0.0, max(falloff, 0.05), deltaFar / transition)
      : 0.0;
    float rampNear = (deltaNear > 0.0)
      ? smoothstep(0.0, max(falloff * 0.85, 0.05), deltaNear / transition)
      : 0.0;

    float coc = max(cocFar * rampFar, cocNear * rampNear);
    coc *= aperture * 650.0;
    return coc / sqrt(coc * coc + 0.08);
  }

  float computeRawCoC(vec2 uv) {
    vec2 aspectcorrect = vec2(1.0, aspect);
    vec2 fromCenter = (uv - 0.5) * aspectcorrect;
    float radial = length(fromCenter);
    float focalDepth = max(focus + focusOffset, 0.5);

    float coc = 0.0;
    bool usedProxy = false;
    if (useProxyDepth > 0.5) {
      float proxyDepth = texture2D(tProxyDepth, uv).x;
      if (proxyDepth < 0.9999) {
        float sceneDepth = linearizeProxyDepth(proxyDepth);
        coc = depthDrivenCoC(sceneDepth, focalDepth);
        usedProxy = true;
      } else {
        float missingDepth = min(cameraFar * 0.6, max(focalDepth + 12.0, 18.0));
        coc = depthDrivenCoC(missingDepth, focalDepth) * 0.95;
        usedProxy = true;
      }
    }

    if (!usedProxy) {
      coc = radialProxyCoC(radial, focalDepth);
    }

    // Style terms stay deliberately light: atmosphere, not the main CoC source.
    coc += smoothstep(9.0, 24.0, focalDepth) * smoothstep(0.48, 0.82, radial) * farBoost;
    coc += smoothstep(0.58, 0.88, radial) * radialEdge * 0.12;
    return clamp(coc, 0.0, 1.0);
  }

  float computeCoC(vec2 uv) {
    float coc = computeRawCoC(uv);

    // Proxy geometry has intentionally simple silhouettes. Smooth CoC across
    // small screen-space neighborhoods so foreground proxy edges do not read
    // as hard blur bands.
    vec2 soften = texelSize * max(12.0, min(maxblur * 2.25, 30.0));
    vec2 halfSoften = soften * 0.5;
    vec2 diagSoften = soften * 0.7071;

    float avg = coc * 2.0;
    avg += computeRawCoC(uv + vec2( halfSoften.x, 0.0));
    avg += computeRawCoC(uv + vec2(-halfSoften.x, 0.0));
    avg += computeRawCoC(uv + vec2(0.0,  halfSoften.y));
    avg += computeRawCoC(uv + vec2(0.0, -halfSoften.y));
    avg += computeRawCoC(uv + vec2( soften.x, 0.0));
    avg += computeRawCoC(uv + vec2(-soften.x, 0.0));
    avg += computeRawCoC(uv + vec2(0.0,  soften.y));
    avg += computeRawCoC(uv + vec2(0.0, -soften.y));
    avg += computeRawCoC(uv + vec2( diagSoften.x,  diagSoften.y));
    avg += computeRawCoC(uv + vec2(-diagSoften.x,  diagSoften.y));
    avg += computeRawCoC(uv + vec2( diagSoften.x, -diagSoften.y));
    avg += computeRawCoC(uv + vec2(-diagSoften.x, -diagSoften.y));
    avg *= 1.0 / 14.0;

    float edgeBlend = smoothstep(0.015, 0.12, abs(avg - coc));
    coc = mix(coc, avg, 0.65 + edgeBlend * 0.3);

    if (debugView > 4.5 && debugView < 5.5) {
      coc = 1.0;
    }

    return clamp(coc, 0.0, 1.0);
  }
`;

const BLUR_GLSL = /* glsl */`
  void addBokehSample(inout vec3 acc, inout float weightSum, sampler2D tex, vec2 uv, vec2 dir, vec2 radius) {
    float r2 = dot(dir, dir);
    float weight = exp(-r2 * 1.15);
    acc += texture2D(tex, uv + dir * radius).rgb * weight;
    weightSum += weight;
  }

  vec3 poissonBokehBlur(sampler2D tex, vec2 uv, vec2 radius) {
    vec3 acc = texture2D(tex, uv).rgb * 1.45;
    float weightSum = 1.45;

    addBokehSample(acc, weightSum, tex, uv, vec2( 0.130,  0.991), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.282,  0.841), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.515,  0.694), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.684,  0.511), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.862,  0.236), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.925, -0.084), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.731, -0.448), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.456, -0.764), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.173, -0.913), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.442, -0.156), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.214,  0.318), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.036,  0.438), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.466, -0.235), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.312,  0.224), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.084, -0.512), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.648, -0.681), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.742,  0.094), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.957, -0.292), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2(-0.156,  0.702), radius);
    addBokehSample(acc, weightSum, tex, uv, vec2( 0.274, -0.372), radius);

    return acc / max(weightSum, 0.0001);
  }
`;

const BlurHorizontalShader = {
  name: 'SplatSafeDofBlurH',
  uniforms: {
    tColor: { value: null },
    ...SHARED_UNIFORMS,
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform float focus;
    uniform float focusOffset;
    uniform float aspect;
    uniform float aperture;
    uniform float maxblur;
    uniform float clearZone;
    uniform float falloff;
    uniform float radialEdge;
    uniform float divergence;
    uniform float nearWeight;
    uniform float farBoost;
    uniform sampler2D tProxyDepth;
    uniform float useProxyDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float debugView;
    uniform vec2 texelSize;

    ${COC_GLSL}

    void main() {
      float coc = computeCoC(vUv);
      if (coc < 0.0003) {
        gl_FragColor = vec4(texture2D(tColor, vUv).rgb, 0.0);
        return;
      }

      vec2 radius = texelSize * maxblur * coc;
      vec3 acc = vec3(0.0);
      acc += texture2D(tColor, vUv + vec2(-4.0, 0.0) * radius).rgb * 0.016216;
      acc += texture2D(tColor, vUv + vec2(-3.0, 0.0) * radius).rgb * 0.054054;
      acc += texture2D(tColor, vUv + vec2(-2.0, 0.0) * radius).rgb * 0.121622;
      acc += texture2D(tColor, vUv + vec2(-1.0, 0.0) * radius).rgb * 0.194595;
      acc += texture2D(tColor, vUv).rgb * 0.227027;
      acc += texture2D(tColor, vUv + vec2( 1.0, 0.0) * radius).rgb * 0.194595;
      acc += texture2D(tColor, vUv + vec2( 2.0, 0.0) * radius).rgb * 0.121622;
      acc += texture2D(tColor, vUv + vec2( 3.0, 0.0) * radius).rgb * 0.054054;
      acc += texture2D(tColor, vUv + vec2( 4.0, 0.0) * radius).rgb * 0.016216;
      gl_FragColor = vec4(acc, coc);
    }
  `,
};

const BlurVerticalShader = {
  name: 'SplatSafeDofBlurV',
  uniforms: {
    tColor: { value: null },
    tBlurH: { value: null },
    ...SHARED_UNIFORMS,
  },
  vertexShader: VERTEX,
  fragmentShader: /* glsl */`
    varying vec2 vUv;
    uniform sampler2D tColor;
    uniform sampler2D tBlurH;
    uniform float focus;
    uniform float focusOffset;
    uniform float aspect;
    uniform float aperture;
    uniform float maxblur;
    uniform float clearZone;
    uniform float falloff;
    uniform float radialEdge;
    uniform float divergence;
    uniform float nearWeight;
    uniform float farBoost;
    uniform sampler2D tProxyDepth;
    uniform float useProxyDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform float debugView;
    uniform vec2 texelSize;

    ${COC_GLSL}
    ${BLUR_GLSL}

    void main() {
      float coc = computeCoC(vUv);
      vec3 sharp = texture2D(tColor, vUv).rgb;

      if (debugView > 0.5 && debugView < 1.5) {
        gl_FragColor = vec4(heatmapColor(coc), 1.0);
        return;
      }

      if (debugView > 1.5 && debugView < 2.5) {
        gl_FragColor = vec4(proxyDepthColor(vUv), 1.0);
        return;
      }

      if (coc < 0.0003 && debugView < 2.5) {
        gl_FragColor = vec4(sharp, 1.0);
        return;
      }

      vec2 radius = texelSize * maxblur * coc;
      vec3 poisson = poissonBokehBlur(tColor, vUv, radius);
      vec3 gaussian = vec3(0.0);
      gaussian += texture2D(tBlurH, vUv + vec2(0.0, -4.0) * radius).rgb * 0.016216;
      gaussian += texture2D(tBlurH, vUv + vec2(0.0, -3.0) * radius).rgb * 0.054054;
      gaussian += texture2D(tBlurH, vUv + vec2(0.0, -2.0) * radius).rgb * 0.121622;
      gaussian += texture2D(tBlurH, vUv + vec2(0.0, -1.0) * radius).rgb * 0.194595;
      gaussian += texture2D(tBlurH, vUv).rgb * 0.227027;
      gaussian += texture2D(tBlurH, vUv + vec2(0.0,  1.0) * radius).rgb * 0.194595;
      gaussian += texture2D(tBlurH, vUv + vec2(0.0,  2.0) * radius).rgb * 0.121622;
      gaussian += texture2D(tBlurH, vUv + vec2(0.0,  3.0) * radius).rgb * 0.054054;
      gaussian += texture2D(tBlurH, vUv + vec2(0.0,  4.0) * radius).rgb * 0.016216;
      vec3 acc = mix(gaussian, poisson, smoothstep(0.18, 0.72, coc));

      if (debugView > 2.5 && debugView < 3.5) {
        gl_FragColor = vec4(acc, 1.0);
        return;
      }

      if (debugView > 3.5 && debugView < 4.5) {
        gl_FragColor = vec4(abs(acc - sharp) * 8.0, 1.0);
        return;
      }

      gl_FragColor = vec4(mix(sharp, acc, coc), 1.0);
    }
  `,
};

/** @deprecated single-pass alias — use DepthOfFieldPass */
export const DofShader = BlurVerticalShader;

export class DepthOfFieldPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.needsSwap = true;

    const hUniforms = UniformsUtils.clone(BlurHorizontalShader.uniforms);
    const vUniforms = UniformsUtils.clone(BlurVerticalShader.uniforms);
    this.uniforms = vUniforms;

    this._materialH = new ShaderMaterial({
      uniforms: hUniforms,
      vertexShader: BlurHorizontalShader.vertexShader,
      fragmentShader: BlurHorizontalShader.fragmentShader,
    });
    this._materialV = new ShaderMaterial({
      uniforms: vUniforms,
      vertexShader: BlurVerticalShader.vertexShader,
      fragmentShader: BlurVerticalShader.fragmentShader,
    });

    this._fsQuadH = new FullScreenQuad(this._materialH);
    this._fsQuadV = new FullScreenQuad(this._materialV);

    this._rtBlur = null;
    this._size = new Vector2(1, 1);
  }

  _syncUniforms() {
    const keys = [
      'focus', 'focusOffset', 'aspect', 'aperture', 'maxblur',
      'clearZone', 'falloff', 'radialEdge', 'divergence', 'nearWeight', 'farBoost',
      'tProxyDepth', 'useProxyDepth', 'cameraNear', 'cameraFar', 'debugView', 'texelSize',
    ];
    const src = this.uniforms;
    for (const key of keys) {
      const val = src[key].value;
      this._materialH.uniforms[key].value = val;
      this._materialV.uniforms[key].value = val;
    }
  }

  _ensureRenderTarget(renderer) {
    const pr = renderer.getPixelRatio();
    const w = Math.max(1, Math.floor(this._size.x * pr));
    const h = Math.max(1, Math.floor(this._size.y * pr));
    if (!this._rtBlur || this._rtBlur.width !== w || this._rtBlur.height !== h) {
      this._rtBlur?.dispose();
      this._rtBlur = new WebGLRenderTarget(w, h, {
        type: HalfFloatType,
        minFilter: LinearFilter,
        magFilter: LinearFilter,
      });
      this._rtBlur.texture.name = 'DofPass.blurH';
    }
    this.uniforms.texelSize.value.set(1 / w, 1 / h);
    this._syncUniforms();
  }

  render(renderer, writeBuffer, readBuffer) {
    this._materialH.uniforms.tColor.value = readBuffer.texture;
    this._materialV.uniforms.tColor.value = readBuffer.texture;
    this.uniforms.aspect.value = this.camera.aspect;
    this.uniforms.cameraNear.value = this.camera.near;
    this.uniforms.cameraFar.value = this.camera.far;
    this._ensureRenderTarget(renderer);

    renderer.setRenderTarget(this._rtBlur);
    if (this.clear) renderer.clear();
    this._fsQuadH.render(renderer);

    this._materialV.uniforms.tBlurH.value = this._rtBlur.texture;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this._fsQuadV.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
      this._fsQuadV.render(renderer);
    }
  }

  setSize(width, height) {
    this._size.set(width, height);
    this.uniforms.aspect.value = width / height;
    this._rtBlur?.dispose();
    this._rtBlur = null;
  }

  dispose() {
    this._materialH.dispose();
    this._materialV.dispose();
    this._fsQuadH.dispose();
    this._fsQuadV.dispose();
    this._rtBlur?.dispose();
  }
}
