import * as THREE from 'three';

/** 帧率无关指数平滑：rate 为每秒衰减率（越大越快跟上目标） */
export function expSmoothAlpha(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

/** 相机润色开关与默认值（可在 PlayerController 构造时覆盖） */
export const CAMERA_CONFIG = {
  /** 环视指数衰减率（1/s）；yaw 略低更丝滑，pitch 略高保持上下跟手 */
  CAMERA_SMOOTH_YAW: 7,
  CAMERA_SMOOTH_PITCH: 9,
  /** @deprecated 旧 per-frame lerp，仅 options.cameraSmooth 覆盖时换算 */
  CAMERA_SMOOTH: 0.1,
  HEAD_BOB_ENABLED: true,
  BREATHING_ENABLED: true,
  HEAD_BOB_AMPLITUDE: 0.018,
  /** 行走时 head bob 固定周期（秒/完整上下循环），与移动速度无关 */
  HEAD_BOB_PERIOD: 1.5,
  BREATHING_AMPLITUDE_Y: 0.0025,
  BREATHING_PITCH_DEG: 0.35,
  BREATHING_FREQ: 0.28,
};

/**
 * 第一人称相机润色：行走 head bob +  idle 呼吸摇晃。
 * 偏移施加在 camera 本地空间，不影响玩家碰撞体 position。
 * 与 PostProcessing/DOF 兼容：仅改 camera.position/quaternion，render 仍用同一 camera。
 */
export class CameraEffects {
  constructor(options = {}) {
    this.config = { ...CAMERA_CONFIG, ...options };
    this._bobPhase = 0;
    this._breathPhase = 0;
    this._moveBlend = 0;
    this._localOffset = new THREE.Vector3();
    this._worldOffset = new THREE.Vector3();
    this._breathPitch = 0;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
  }

  /**
   * @param {number} dt
   * @param {{ moving?: boolean, effectsEnabled?: boolean }} state
   */
  update(dt, { moving = false, effectsEnabled = true } = {}) {
    const cfg = this.config;
    let x = 0;
    let y = 0;

    const targetMove = moving ? 1 : 0;
    this._moveBlend += (targetMove - this._moveBlend) * Math.min(1, dt * 5);

    if (cfg.HEAD_BOB_ENABLED && effectsEnabled && this._moveBlend > 0.01) {
      if (moving) {
        this._bobPhase += (Math.PI * 2 / cfg.HEAD_BOB_PERIOD) * dt;
      }
      y += Math.sin(this._bobPhase) * cfg.HEAD_BOB_AMPLITUDE * this._moveBlend;
      x += Math.cos(this._bobPhase * 0.5) * cfg.HEAD_BOB_AMPLITUDE * 0.2 * this._moveBlend;
    }

    this._breathPitch = 0;
    if (cfg.BREATHING_ENABLED && effectsEnabled) {
      const breathWeight = moving ? 0.22 : 1;
      this._breathPhase += dt * cfg.BREATHING_FREQ * Math.PI * 2;
      const s = Math.sin(this._breathPhase);
      y += s * cfg.BREATHING_AMPLITUDE_Y * breathWeight;
      this._breathPitch = s * THREE.MathUtils.degToRad(cfg.BREATHING_PITCH_DEG) * breathWeight;
    }

    this._localOffset.set(x, y, 0);
  }

  /** 将基础位姿 + 润色偏移写入 camera（不修改玩家碰撞 position） */
  applyToCamera(camera, basePosition, yaw, pitch) {
    const totalPitch = pitch + this._breathPitch;
    this._euler.set(totalPitch, yaw, 0);
    camera.quaternion.setFromEuler(this._euler);

    this._worldOffset.copy(this._localOffset);
    this._worldOffset.applyQuaternion(camera.quaternion);
    camera.position.copy(basePosition).add(this._worldOffset);
  }
}
