import * as THREE from 'three';
import { OrbitCamera } from './OrbitCamera.js';
import { ClaritySystem } from './ClaritySystem.js';
import { GuessUI } from './GuessUI.js';
import { GaussianLoader } from './GaussianLoader.js';

const DEFAULT_SPEC = {
  title: '找角度游戏',
  targetLabel: '咖啡杯',
  distractors: ['茶壶', '花瓶', '马克杯'],
  difficulty: 'normal',
  clarityConfig: { winThreshold: 0.85, maxHints: 2 },
  loseCondition: { timerSeconds: 60, maxWrongGuesses: 3 },
};

async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

async function loadGameData() {
  let metadata;
  try {
    metadata = await fetchJson('assets/gaussian-metadata.json');
  } catch {
    metadata = {
      centroid: [0, 0.5, 0],
      sourceCamera: { position: [0, 1, 3], target: [0, 0.5, 0], azimuthDeg: 0, elevationDeg: 15 },
      targetLabel: '咖啡杯',
      viewDependenceScore: 0.8,
    };
  }

  let clarityCurve;
  try {
    clarityCurve = await fetchJson('generated/clarity-curve.json');
  } catch {
    clarityCurve = { peak: { yawDegrees: 0, pitchDegrees: 15 }, sigmaRadians: 0.22 };
  }

  let gameSpec;
  try {
    gameSpec = await fetchJson('generated/game-spec.json');
  } catch {
    gameSpec = { ...DEFAULT_SPEC, targetLabel: metadata.targetLabel || '咖啡杯' };
  }

  let assetUrls = {};
  try {
    assetUrls = await fetchJson('assets/asset-urls.json');
  } catch {
    /* optional */
  }

  return { metadata, clarityCurve, gameSpec, assetUrls };
}

function inferStartAngles(metadata, difficulty) {
  const offsets = {
    easy: { yaw: 60, pitch: 20 },
    normal: { yaw: 120, pitch: 25 },
    hard: { yaw: 150, pitch: 35 },
  };
  const off = offsets[difficulty] || offsets.normal;
  const peakYaw = metadata.sourceCamera?.azimuthDeg ?? 0;
  const peakPitch = metadata.sourceCamera?.elevationDeg ?? 15;
  return {
    yawDeg: peakYaw + off.yaw,
    pitchDeg: Math.max(-30, Math.min(55, peakPitch + off.pitch - 10)),
  };
}

class AngleGame {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.orbit = null;
    this.clarity = null;
    this.ui = null;
    this.loader = null;
    this.splatRoot = null;
    this.gameSpec = null;
    this.metadata = null;
    this.startAngles = { yawDeg: 120, pitchDeg: 10 };
    this.blurOverlay = null;
    this._raf = null;
  }

  async init() {
    const data = await loadGameData();
    this.gameSpec = data.gameSpec;
    this.metadata = data.metadata;
    this.startAngles = inferStartAngles(data.metadata, data.gameSpec.difficulty);

    const canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x0a0a12);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0a0a12, 4, 14);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);

    const centroid = data.metadata.centroid ?? [0, 0.5, 0];
    const pivot = { x: centroid[0], y: centroid[1], z: centroid[2] };

    const ambient = new THREE.AmbientLight(0x8899bb, 0.55);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(3, 5, 2);
    this.scene.add(dir);

    this.loader = new GaussianLoader(this.scene);
    const splat = await this.loader.load(data.metadata, data.assetUrls);
    this.splatRoot = splat.root;
    console.info(`Splat mode: ${splat.mode}`);

    this.orbit = new OrbitCamera(this.camera, canvas, pivot);
    this.orbit.setStartOffset(this.startAngles.yawDeg, this.startAngles.pitchDeg);

    this.clarity = new ClaritySystem(data.metadata, data.clarityCurve);

    this.ui = new GuessUI(data.gameSpec, {
      onReset: () => this.reset(),
      onHint: () => {},
      onGameEnd: () => {},
    });

    window.addEventListener('resize', () => this._onResize());
    this._createBlurOverlay();
    this._loop();

    document.getElementById('loading').classList.add('hidden');
  }

  _createBlurOverlay() {
    this.blurOverlay = document.createElement('div');
    this.blurOverlay.id = 'blur-overlay';
    this.blurOverlay.style.cssText = [
      'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:5',
      'backdrop-filter:blur(0px)', '-webkit-backdrop-filter:blur(0px)',
      'transition:backdrop-filter 0.1s ease, opacity 0.1s ease', 'opacity:0',
      'background:rgba(10,10,18,0.12)',
    ].join(';');
    document.body.appendChild(this.blurOverlay);
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _loop() {
    this._tick();
    this.renderer.render(this.scene, this.camera);
    this._raf = requestAnimationFrame(() => this._loop());
  }

  _tick() {
    const { yawDegrees, pitchDegrees } = this.orbit.getYawPitchDegrees();
    const { clarity } = this.clarity.computeFromYawPitch(yawDegrees, pitchDegrees);
    const visual = this.clarity.getVisualParams(clarity);

    this.loader.applyVisuals(this.splatRoot, visual);
    this.ui.updateClarity(clarity);

    if (this.blurOverlay) {
      this.blurOverlay.style.backdropFilter = `blur(${visual.blurPx}px)`;
      this.blurOverlay.style.webkitBackdropFilter = `blur(${visual.blurPx}px)`;
      this.blurOverlay.style.opacity = String(0.08 + (1 - clarity) * 0.5);
    }

    const budget = this.gameSpec.loseCondition?.rotationBudgetDegrees ?? 0;
    if (budget > 0) {
      this.ui.checkRotationBudget(this.orbit.totalRotationDeg, budget);
    }
  }

  reset() {
    this.orbit.setStartOffset(this.startAngles.yawDeg, this.startAngles.pitchDeg);
    this.orbit.resetRotationBudget();
    this.ui.reset();
    this._tick();
  }
}

const game = new AngleGame();
game.init().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = '加载失败：' + err.message;
});
