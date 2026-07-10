/**
 * Load Gaussian metadata and create splat visualization (Three.js).
 * Uses real .sog when URL available; otherwise procedural point-cloud placeholder.
 */
import * as THREE from 'three';

export class GaussianLoader {
  constructor(scene) {
    this.scene = scene;
  }

  async load(metadata, assetUrls) {
    const centroid = metadata.centroid ?? [0, 0.5, 0];
    const pivot = new THREE.Vector3(centroid[0], centroid[1], centroid[2]);

    const root = new THREE.Group();
    root.position.copy(pivot);
    this.scene.add(root);

    const sogUrl = metadata.sogUrl || assetUrls?.sogUrl || assetUrls?.sog || '';
    if (sogUrl) {
      console.info('SOG URL present but loader uses placeholder in browser demo:', sogUrl);
    }

    const label = metadata.targetLabel || '咖啡杯';
    this._createPlaceholderSplat(root, label);

    return { root, pivot, mode: sogUrl ? 'placeholder_with_url' : 'placeholder' };
  }

  _createPlaceholderSplat(root, label) {
    const points = this._shapeForLabel(label);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    const sizes = new Float32Array(points.length);

    const baseColor = label.includes('跑') || label.includes('车')
      ? new THREE.Color(0.85, 0.15, 0.12)
      : label.includes('球')
        ? new THREE.Color(0.95, 0.55, 0.1)
        : new THREE.Color(0.78, 0.52, 0.32);

    points.forEach((pt, i) => {
      positions[i * 3] = pt[0];
      positions[i * 3 + 1] = pt[1];
      positions[i * 3 + 2] = pt[2];
      colors[i * 3] = baseColor.r;
      colors[i * 3 + 1] = baseColor.g;
      colors[i * 3 + 2] = baseColor.b;
      sizes[i] = (pt[3] ?? 1) * 0.06;
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
      depthWrite: false,
    });

    const cloud = new THREE.Points(geometry, material);
    cloud.name = 'splat-cloud';
    root.add(cloud);

    const groundGeo = new THREE.PlaneGeometry(2.5, 2.5);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a28,
      roughness: 0.9,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.55;
    root.add(ground);

    root.userData.splatCloud = cloud;
    root.userData.baseOpacities = [material.opacity];
  }

  _shapeForLabel(label) {
    const mug = () => {
      const pts = [];
      for (let a = 0; a < 32; a++) {
        const t = (a / 32) * Math.PI * 2;
        pts.push([Math.cos(t) * 0.35, 0.35 + Math.sin(t) * 0.08, Math.sin(t) * 0.35, 1]);
      }
      for (let y = 0; y < 10; y++) {
        const h = y * 0.1;
        for (let a = 0; a < 20; a++) {
          const t = (a / 20) * Math.PI * 2;
          pts.push([Math.cos(t) * 0.32, h, Math.sin(t) * 0.32, 0.9]);
        }
      }
      for (let i = 0; i < 14; i++) {
        pts.push([0.38, 0.15 + i * 0.055, 0, 0.75]);
      }
      return pts;
    };

    const car = () => {
      const pts = [];
      for (let x = -10; x <= 10; x++) {
        for (let z = -4; z <= 4; z++) {
          const nx = x / 10;
          const nz = z / 4;
          if (nx * nx + nz * nz <= 1) {
            pts.push([nx * 0.95, 0.2 + (1 - nx * nx) * 0.25, nz * 0.38, 0.85]);
          }
        }
      }
      return pts;
    };

    const sphere = () => {
      const pts = [];
      for (let lat = 0; lat < 12; lat++) {
        for (let lon = 0; lon < 18; lon++) {
          const phi = (lat / 11) * Math.PI;
          const theta = (lon / 18) * Math.PI * 2;
          pts.push([
            Math.sin(phi) * Math.cos(theta) * 0.42,
            0.45 + Math.cos(phi) * 0.42,
            Math.sin(phi) * Math.sin(theta) * 0.42,
            0.9,
          ]);
        }
      }
      return pts;
    };

    if (label.includes('跑') || label.includes('车')) return car();
    if (label.includes('球')) return sphere();
    return mug();
  }

  applyVisuals(root, visualParams) {
    const cloud = root.userData.splatCloud;
    if (!cloud) return;
    const mat = cloud.material;
    mat.opacity = visualParams.opacity;
    mat.size = 0.04 + visualParams.clarity * 0.06;
    const scale = visualParams.scale;
    cloud.scale.set(scale, scale, scale);
  }
}
