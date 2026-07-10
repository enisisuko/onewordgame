/**
 * Pure HTML Gaussian loader — loading flow from 实习 高斯引擎v2:
 *   viewer/src/model.js (loadSogFromUrl, URL resolve)
 *   viewer/src/splat-input-formats.js (format detection)
 * Rendering: @sparkjsdev/spark SplatMesh + SparkRenderer (Three.js), NOT PlayCanvas gsplat.
 */
import * as THREE from 'three';
import { SplatMesh, SparkRenderer } from '@sparkjsdev/spark';

const TRANSFORM_SUFFIXES = ['.compressed.ply', '.ply', '.ksplat', '.spz', '.splat'];

export function isSplatTransformInput(name) {
  const n = String(name || '').toLowerCase();
  return TRANSFORM_SUFFIXES.some((suf) => n.endsWith(suf));
}

export function isDirectSogFile(name) {
  return String(name || '').toLowerCase().endsWith('.sog');
}

function resolveAssetUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) return trimmed;
  return `/${trimmed}`;
}

export class GaussianLoaderV2 {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.spark = null;
    this._activeSplat = null;
    this._depthWrite = false;
  }

  ensureSpark() {
    if (!this.spark) {
      this.spark = new SparkRenderer({
        renderer: this.renderer,
        depthWrite: this._depthWrite,
      });
      this.scene.add(this.spark);
    }
    return this.spark;
  }

  /** 景深后处理需要 splat 写入深度缓冲（Spark 默认 depthWrite=false） */
  setDepthWrite(enabled) {
    this._depthWrite = !!enabled;
    if (this.spark?.material) {
      this.spark.material.depthWrite = this._depthWrite;
    }
  }

  resolveSogUrl(metadata, assetUrls) {
    const fromMeta = metadata?.sogUrl || metadata?.sog_url;
    const fromAssets =
      assetUrls?.sogUrl || assetUrls?.sog_url || assetUrls?.sog || assetUrls?.localSog;
    return resolveAssetUrl(fromMeta || fromAssets || '');
  }

  resolvePlyUrl(metadata, assetUrls) {
    const raw = metadata?.plyUrl || metadata?.ply_url || assetUrls?.plyUrl || assetUrls?.ply_url;
    return resolveAssetUrl(raw || '');
  }

  async load(metadata, assetUrls) {
    this.ensureSpark();

    const centroid = metadata?.centroid ?? [0, 0.5, 0];
    const pivot = new THREE.Vector3(centroid[0], centroid[1], centroid[2]);

    const root = new THREE.Group();
    root.name = 'splat-root';
    root.position.copy(pivot);
    this.scene.add(root);

    const sogUrl = this.resolveSogUrl(metadata, assetUrls);
    const plyUrl = this.resolvePlyUrl(metadata, assetUrls);
    const directUrl = sogUrl || plyUrl;

    if (directUrl) {
      try {
        const loaded = await this._loadSparkSplat(root, directUrl);
        return { root, pivot, mode: 'spark', splatMesh: loaded.splatMesh };
      } catch (err) {
        console.warn('[GaussianLoaderV2] spark load failed, using placeholder:', err);
      }
    }

    const label = metadata?.targetLabel || '咖啡杯';
    this._createPlaceholderSplat(root, label);
    return {
      root,
      pivot,
      mode: directUrl ? 'placeholder_fallback' : 'placeholder',
      splatMesh: null,
    };
  }

  /**
   * 坐标矫正：实习 v2 对 PLY 用 euler(180°,180°,0°)；Spark 直读 SOG 无需额外旋转。
   * Coastal Fishing SOG 已是 Y-up，wrapper 保持单位旋转（此前 X 180° 导致上下颠倒）。
   */
  async _loadSparkSplat(root, url) {
    if (this._activeSplat) {
      root.remove(this._activeSplat.wrapper);
      this._activeSplat.mesh.dispose?.();
      this._activeSplat = null;
    }

    const wrapper = new THREE.Group();
    wrapper.name = 'splat-correction';
    root.add(wrapper);

    const splatMesh = new SplatMesh({ url, lod: true });
    wrapper.add(splatMesh);

    await splatMesh.initialized;

    const box = splatMesh.getBoundingBox(true);
    let baseScale = 1;
    if (box && !box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 4) {
        baseScale = 2 / maxDim;
        splatMesh.scale.setScalar(baseScale);
      }
    }
    splatMesh.userData.baseScale = baseScale;

    this._activeSplat = { mesh: splatMesh, wrapper };
    root.userData.splatMesh = splatMesh;
    root.userData.mode = 'spark';
    return { splatMesh, wrapper };
  }

  _createPlaceholderSplat(root, label) {
    const points = this._shapeForLabel(label);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);

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
    });

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

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
    root.userData.mode = 'placeholder';
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
    const splatMesh = root.userData.splatMesh;
    if (splatMesh) {
      splatMesh.opacity = visualParams.opacity;
      const base = splatMesh.userData.baseScale ?? 1;
      splatMesh.scale.setScalar(base * visualParams.scale);
      if (visualParams.clarity < 0.35) {
        splatMesh.lodScale = 0.55;
      } else if (visualParams.clarity < 0.7) {
        splatMesh.lodScale = 0.85;
      } else {
        splatMesh.lodScale = 1.0;
      }
      return;
    }

    const cloud = root.userData.splatCloud;
    if (!cloud) return;
    const mat = cloud.material;
    mat.opacity = visualParams.opacity;
    mat.size = 0.04 + visualParams.clarity * 0.06;
    const scale = visualParams.scale;
    cloud.scale.set(scale, scale, scale);
  }
}
