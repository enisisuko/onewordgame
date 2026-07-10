import * as THREE from 'three';

import { CameraEffects, CAMERA_CONFIG, expSmoothAlpha } from './CameraEffects.js';

/** 默认眼高（米），与场景比例一致 */
export const DEFAULT_EYE_HEIGHT = 0.465;
/** DOF 清晰区默认倍数：≈3 个身位 */
export const DOF_CLEAR_ZONE_MULTIPLIER = 3;

/**

 * 第一人称走动 + 环视。桌面 WASD + 鼠标拖拽；移动端由 MobileControls 供输入。

 * 环视经 targetYaw/targetPitch 平滑；行走 head bob / idle 呼吸由 CameraEffects 处理。

 */

export class PlayerController {

  constructor(camera, options = {}) {

    this.camera = camera;

    this.mobile = options.mobileControls ?? null;

    this.speed = options.speed ?? 3.2;

    this.bounds = options.bounds ?? { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };

    this.eyeHeight = options.eyeHeight ?? DEFAULT_EYE_HEIGHT;



    if (options.cameraSmooth != null) {
      const rate = -60 * Math.log(1 - Math.min(options.cameraSmooth, 0.999));
      this.cameraSmoothYaw = rate;
      this.cameraSmoothPitch = rate;
    } else {
      this.cameraSmoothYaw = options.cameraSmoothYaw ?? CAMERA_CONFIG.CAMERA_SMOOTH_YAW;
      this.cameraSmoothPitch = options.cameraSmoothPitch ?? CAMERA_CONFIG.CAMERA_SMOOTH_PITCH;
    }

    this.cameraEffects = new CameraEffects(options.cameraEffects);



    this.position = new THREE.Vector3(

      options.startPosition?.x ?? 0,

      this.eyeHeight,

      options.startPosition?.z ?? 4

    );

    this.yaw = options.startYaw ?? 0;

    this.pitch = options.startPitch ?? 0;

    this.targetYaw = this.yaw;

    this.targetPitch = this.pitch;

    this.minPitch = -0.35;

    this.maxPitch = 1.15;



    this.enabled = true;

    this._keys = Object.create(null);

    this._mouseLook = false;

    this._lastMouseX = 0;

    this._lastMouseY = 0;

    this._moving = false;



    this._onKeyDown = (e) => { this._keys[e.code] = true; };

    this._onKeyUp = (e) => { this._keys[e.code] = false; };

    this._onMouseDown = this._onMouseDown.bind(this);

    this._onMouseMove = this._onMouseMove.bind(this);

    this._onMouseUp = this._onMouseUp.bind(this);



    window.addEventListener('keydown', this._onKeyDown);

    window.addEventListener('keyup', this._onKeyUp);



    const canvas = options.canvas;

    if (canvas) {

      canvas.addEventListener('mousedown', this._onMouseDown);

      window.addEventListener('mousemove', this._onMouseMove);

      window.addEventListener('mouseup', this._onMouseUp);

    }

  }



  setEnabled(on) {

    this.enabled = on;

    if (!on) {

      this._mouseLook = false;

      Object.keys(this._keys).forEach((k) => { this._keys[k] = false; });

    }

  }



  dispose() {

    window.removeEventListener('keydown', this._onKeyDown);

    window.removeEventListener('keyup', this._onKeyUp);

  }



  _onMouseDown(e) {

    if (!this.enabled || e.button !== 0) return;

    this._mouseLook = true;

    this._lastMouseX = e.clientX;

    this._lastMouseY = e.clientY;

    e.preventDefault();

  }



  _onMouseMove(e) {

    if (!this.enabled || !this._mouseLook) return;

    const dx = e.clientX - this._lastMouseX;

    const dy = e.clientY - this._lastMouseY;

    this._lastMouseX = e.clientX;

    this._lastMouseY = e.clientY;

    this.targetYaw -= dx * 0.003;

    this.targetPitch -= dy * 0.003;

    this._clampTargetPitch();

  }



  _onMouseUp() {

    this._mouseLook = false;

  }



  _clampPitch() {

    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));

  }



  _clampTargetPitch() {

    this.targetPitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.targetPitch));

  }



  _smoothLook(dt) {

    const yawA = expSmoothAlpha(this.cameraSmoothYaw, dt);

    const pitchA = expSmoothAlpha(this.cameraSmoothPitch, dt);

    this.yaw += (this.targetYaw - this.yaw) * yawA;

    this.pitch += (this.targetPitch - this.pitch) * pitchA;

    this._clampPitch();

  }



  update(dt) {

    if (!this.enabled) return;



    this.mobile?.beginFrame();



    if (this.mobile?.lookDelta) {

      this.targetYaw += this.mobile.lookDelta.dx;

      this.targetPitch += this.mobile.lookDelta.dy;

      this._clampTargetPitch();

    }



    let mx = 0;

    let mz = 0;

    if (this._keys.KeyW || this._keys.ArrowUp) mz -= 1;

    if (this._keys.KeyS || this._keys.ArrowDown) mz += 1;

    if (this._keys.KeyA || this._keys.ArrowLeft) mx -= 1;

    if (this._keys.KeyD || this._keys.ArrowRight) mx += 1;



    if (this.mobile?.enabled && this.mobile.move) {

      mx += this.mobile.move.x;

      mz += this.mobile.move.z;

    }



    const len = Math.hypot(mx, mz);

    this._moving = len > 0.001;

    if (this._moving) {

      mx /= len;

      mz /= len;

      const sin = Math.sin(this.yaw);

      const cos = Math.cos(this.yaw);

      const worldX = mx * cos + mz * sin;

      const worldZ = -mx * sin + mz * cos;

      this.position.x += worldX * this.speed * dt;

      this.position.z += worldZ * this.speed * dt;

      this.position.x = THREE.MathUtils.clamp(this.position.x, this.bounds.minX, this.bounds.maxX);

      this.position.z = THREE.MathUtils.clamp(this.position.z, this.bounds.minZ, this.bounds.maxZ);

    }



    this.position.y = this.eyeHeight;

    this._smoothLook(dt);



    this.cameraEffects.update(dt, {

      moving: this._moving,

      effectsEnabled: this.enabled,

    });

    this.cameraEffects.applyToCamera(this.camera, this.position, this.yaw, this.pitch);

  }



  getPosition() {

    return this.position;

  }

  isMoving() {

    return this._moving;

  }



  syncLookTargets() {

    this.targetYaw = this.yaw;

    this.targetPitch = this.pitch;

  }

}


