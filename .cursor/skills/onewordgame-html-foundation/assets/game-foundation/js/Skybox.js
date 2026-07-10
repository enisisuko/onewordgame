import * as THREE from 'three';

const SKY_VERTEX = `
varying float vWorldY;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldY = worldPos.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAGMENT = `
varying float vWorldY;
uniform float uTopY;
uniform float uHorizonY;
uniform float uBottomY;
uniform vec3 uTopColor;
uniform vec3 uHorizonColor;
uniform vec3 uBottomColor;

void main() {
  vec3 color;
  if (vWorldY >= uHorizonY) {
    float t = smoothstep(uHorizonY, uTopY, vWorldY);
    color = mix(uHorizonColor, uTopColor, t);
  } else {
    float t = smoothstep(uBottomY, uHorizonY, vWorldY);
    color = mix(uBottomColor, uHorizonColor, t);
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

/** 蓝白渐变天空球 — BackSide、不写深度，渲染在 splat 之后方 */
export function createSkybox(scene, options = {}) {
  const radius = options.radius ?? 55;
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTopY: { value: options.topY ?? 18 },
      uHorizonY: { value: options.horizonY ?? 2.5 },
      uBottomY: { value: options.bottomY ?? -8 },
      uTopColor: { value: new THREE.Color(options.topColor ?? 0x87ceeb) },
      uHorizonColor: { value: new THREE.Color(options.horizonColor ?? 0xf5faff) },
      uBottomColor: { value: new THREE.Color(options.bottomColor ?? 0xe8f4fc) },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Skybox';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}
