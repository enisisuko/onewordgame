import * as THREE from 'three';
import { GaussianLoaderV2 } from './GaussianLoaderV2.js';
import { FishingGame } from './FishingGame.js';
import { PlayerController } from './PlayerController.js';
import { MobileControls } from './MobileControls.js';
import { WorldMarkers } from './WorldMarkers.js';
import { GameManager } from './GameManager.js';
import { MarkerPanelGame } from './MarkerPanelGame.js';
import { PostProcessing } from './PostProcessing.js';
import { createSkybox } from './Skybox.js';
import { createDofProxyRoot } from './DofProxyScene.js';
import { FirstPersonRod } from './FirstPersonRod.js';

const DEFAULT_SPEC = {
  title: '水族馆钓鱼',
  targetLabel: '海岸钓鱼平台',
  difficulty: 'normal',
  fishingConfig: {},
};

const WORLD_MARKERS = [
  {
    id: 'WM_Fishing',
    type: 'fishing',
    label: '钓鱼平台 — 按 E 或走入开始钓鱼',
    position: [0, 0, 1.2],
    radius: 1.35,
    color: 0x5ddf8a,
  },
  {
    id: 'WM_Dock',
    type: 'dock',
    label: '木质码头 — 眺望海岸',
    position: [-2.8, 0, -0.5],
    radius: 1.1,
    color: 0x7ee8fa,
  },
  {
    id: 'WM_Shore',
    type: 'shore',
    label: '浅水区 — 小心滑倒',
    position: [2.5, 0, -1.8],
    radius: 1.0,
    color: 0xffcc66,
  },
];

/** 固定手机内屏逻辑分辨率；CSS #phone-screen 负责缩放显示 */
const RENDER_SIZE = { w: 390, h: 844 };
/** 玩家移动速度降为原先 3.2 的一半 */
const PLAYER_SPEED = 1.6;

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
      centroid: [0, 0, 0],
      sourceCamera: { position: [0, 1.2, 4], target: [0, 0, 0], azimuthDeg: 0, elevationDeg: 12 },
      targetLabel: '海岸钓鱼平台',
      sogUrl: 'assets/coastal-fishing-vista.sog',
    };
  }

  let gameSpec;
  try {
    gameSpec = await fetchJson('generated/game-spec.json');
  } catch {
    gameSpec = { ...DEFAULT_SPEC };
  }

  let assetUrls = {};
  try {
    assetUrls = await fetchJson('assets/asset-urls.json');
  } catch {
    /* optional */
  }

  return { metadata, gameSpec, assetUrls };
}

class AquariumFishingGame {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.player = null;
    this.mobile = null;
    this.markers = null;
    this.gameManager = null;
    this.fishing = null;
    this.markerPanel = null;
    this.loader = null;
    this.splatRoot = null;
    this.dofProxyRoot = null;
    this.firstPersonRod = null;
    this.gameSpec = null;
    this._lastTs = performance.now();
    this._nearFishing = false;
    this.postProcessing = null;
    this._dofStrength = 0.55;
  }

  async init() {
    const loadingDetail = document.getElementById('loading-detail');
    const data = await loadGameData();
    this.gameSpec = data.gameSpec;

    const canvas = document.getElementById('game-canvas');
    this._phoneScreen = document.getElementById('phone-screen');
    const { w, h } = this._getRenderSize();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    const horizonColor = 0xe8f4fc;
    this.renderer.setClearColor(horizonColor);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(horizonColor, 12, 28);
    createSkybox(this.scene);

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);

    const ambient = new THREE.AmbientLight(0x6688aa, 0.65);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xaaccff, 0.85);
    dir.position.set(4, 8, 3);
    this.scene.add(dir);

    this._createGround();

    if (loadingDetail) loadingDetail.textContent = '加载 Gaussian splat…';
    this.loader = new GaussianLoaderV2(this.scene, this.renderer);
    const splat = await this.loader.load(data.metadata, data.assetUrls);
    this.splatRoot = splat.root;
    console.info(`[AquariumFishing] Splat mode: ${splat.mode}`);

    this.loader.applyVisuals(this.splatRoot, {
      opacity: 1,
      scale: 1,
      clarity: 1,
    });

    const cam = data.metadata.sourceCamera;
    const startYaw = cam ? ((cam.azimuthDeg ?? 0) * Math.PI) / 180 : 0;
    const startPitch = cam ? ((cam.elevationDeg ?? 12) * Math.PI) / 180 : 0.2;

    this.mobile = new MobileControls(canvas);
    this.player = new PlayerController(this.camera, {
      canvas,
      mobileControls: this.mobile,
      speed: PLAYER_SPEED,
      startPosition: { x: 0, z: 4 },
      startYaw,
      startPitch,
      bounds: { minX: -5.5, maxX: 5.5, minZ: -5.5, maxZ: 5.5 },
    });

    this.gameManager = new GameManager({
      onEnterExplore: () => this._onEnterExplore(),
      onEnterFishing: (info) => this._onEnterFishing(info),
      onEnterMarker: (info) => this._onEnterMarker(info),
    });

    this.markers = new WorldMarkers(this.scene, WORLD_MARKERS, (info) => {
      this.gameManager.onMarkerTouch(info);
    });

    this.fishing = new FishingGame(this.gameSpec, {
      onClose: () => this.gameManager.enterExplore(),
      onReset: () => this.reset(),
      onExploreStart: () => this._dismissOverlay(),
      onRodAction: (action) => this.firstPersonRod?.handleFishingAction(action),
    });

    this.markerPanel = new MarkerPanelGame({
      onClose: () => this.gameManager.enterExplore(),
    });

    this.firstPersonRod = new FirstPersonRod(this.scene);
    this.postProcessing = new PostProcessing(this.renderer, this.scene, this.camera);
    this.dofProxyRoot = createDofProxyRoot(WORLD_MARKERS);
    this.dofProxyRoot.add(this.firstPersonRod.proxyRoot);
    this.postProcessing.setDofProxyRoot(this.dofProxyRoot);
    this.postProcessing.setBokehStrength(this._dofStrength);
    this._setDofEnabled(true);
    this._bindDofUi();

    this._bindKeyboard();
    window.addEventListener('resize', () => this._onResize());
    if (this._phoneScreen && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._onResize());
      this._resizeObserver.observe(this._phoneScreen);
    }
    document.body.classList.add('mode-explore');
    this._updateHints();
    this._loop();

    document.getElementById('loading').classList.add('hidden');

    const overlay = document.getElementById('overlay');
    if (overlay) {
      overlay.classList.add('visible');
      document.getElementById('overlay-title').textContent = '🐠 水族馆钓鱼';
      document.getElementById('overlay-msg').textContent =
        '在海岸高斯场景中自由走动，找到倒三角路标进入钓鱼点。桌面：WASD 移动、鼠标拖动环视。手机：左下摇杆移动、右半屏拖动环视。';
      document.getElementById('overlay-restart').textContent = '开始探索';
    }
  }

  _createGround() {
    const groundGeo = new THREE.PlaneGeometry(14, 14);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x142a38,
      roughness: 0.95,
      metalness: 0.05,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.name = 'Ground';
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.visible = false;
    this.scene.add(ground);
  }

  _getRenderSize() {
    return RENDER_SIZE;
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.gameManager.isExplore() && this._nearFishing) {
        e.preventDefault();
        this.gameManager.enterFishing({
          type: 'fishing',
          marker: 'WM_Fishing',
          label: '钓鱼平台',
        });
      }
      if (e.code === 'Escape' && this.gameManager.isFishing()) {
        this.fishing.closeSession();
      }
      if (e.code === 'Escape' && this.gameManager.isMarker()) {
        this.markerPanel.closeSession();
      }
    });
  }

  _dismissOverlay() {
    document.getElementById('overlay')?.classList.remove('visible');
  }

  _onEnterExplore() {
    this.player.setEnabled(true);
    this.mobile.setEnabled(true);
    this.markers.setVisible(true);
    this.firstPersonRod?.handleFishingAction({ type: 'stow' });
    this.postProcessing?.setQuality('medium');
    this._updateHints();
  }

  _onEnterFishing() {
    this.player.setEnabled(false);
    this.mobile.setEnabled(false);
    this.fishing.openSession();
    this.postProcessing?.setQuality('low');
    this._updateHints();
  }

  _onEnterMarker(info) {
    this.player.setEnabled(false);
    this.mobile.setEnabled(false);
    this.markerPanel.openSession(info);
    this.postProcessing?.setQuality('low');
    this._updateHints();
  }

  _updateHints() {
    const exploreHint = document.getElementById('explore-hint');
    const mobileHint = document.getElementById('mobile-hint');
    const isExplore = this.gameManager.isExplore();
    const touch = this.mobile?.visible;

    if (exploreHint) {
      exploreHint.textContent = touch
        ? '摇杆移动 · 右屏环视'
        : 'WASD · 鼠标环视 · E 钓鱼';
      exploreHint.classList.toggle('hidden', !isExplore);
    }
    if (mobileHint) {
      mobileHint.classList.add('hidden');
    }
  }

  _checkNearFishing() {
    const pos = this.player.getPosition();
    const fishing = WORLD_MARKERS.find((m) => m.id === 'WM_Fishing');
    if (!fishing) return;
    const dx = pos.x - fishing.position[0];
    const dz = pos.z - fishing.position[2];
    this._nearFishing = Math.hypot(dx, dz) <= fishing.radius;
  }

  _getFocusRaycastTargets() {
    const targets = [];
    if (this.markers?._group) targets.push(this.markers._group);
    return targets;
  }

  _onResize() {
    const { w, h } = this._getRenderSize();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.postProcessing?.setSize(w, h);
  }

  _setDofEnabled(on) {
    this.postProcessing?.setEnabled(on);
    const btn = document.getElementById('btn-dof');
    if (btn) {
      btn.textContent = '景深';
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.setAttribute('aria-label', on ? '关闭景深' : '开启景深');
      btn.title = on ? '景深已开启' : '景深已关闭';
    }
  }

  _bindDofUi() {
    const btn = document.getElementById('btn-dof');
    btn?.addEventListener('click', () => {
      const next = !this.postProcessing?.enabled;
      this._setDofEnabled(next);
    });
  }

  _loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastTs) / 1000);
    this._lastTs = now;

    if (this.gameManager.isExplore()) {
      this.player.update(dt);
      this.markers.update(this.player.getPosition(), dt);
      this._checkNearFishing();
    }

    this.gameManager.tick(dt);
    this.fishing.tick(dt);
    this.markerPanel.tick(dt);
    this.firstPersonRod?.update(dt, this.camera, this.player?.isMoving?.() ?? false);

    if (this.postProcessing?.enabled) {
      this.postProcessing.updateFocus(this.splatRoot, this._getFocusRaycastTargets(), dt);
    }
    this.postProcessing?.render();
    requestAnimationFrame(() => this._loop());
  }

  reset() {
    this.player.position.set(0, this.player.eyeHeight, 4);
    const cam = this.gameSpec?.sourceCamera;
    if (cam) {
      this.player.yaw = ((cam.azimuthDeg ?? 0) * Math.PI) / 180;
      this.player.pitch = ((cam.elevationDeg ?? 12) * Math.PI) / 180;
      this.player.syncLookTargets();
    }
    this.fishing.reset();
    if (this.gameManager.isFishing()) {
      this.fishing.openSession();
    }
  }
}

const game = new AquariumFishingGame();
window.__game = game;
game.init().catch((err) => {
  console.error(err);
  const loading = document.getElementById('loading');
  if (loading) {
    loading.textContent = '加载失败：' + err.message;
    loading.classList.remove('hidden');
  }
});
