/**
 * Maps orbit view direction to clarity score (0–1) using Gaussian falloff from truth angle.
 */
export class ClaritySystem {
  constructor(metadata, clarityCurve) {
    this.metadata = metadata;
    this.curve = clarityCurve;
    this.sigmaRad = clarityCurve?.sigmaRadians ?? 0.22;
    this.floor = 0.08;
    this.ceiling = 1.0;

    const peak = clarityCurve?.peak ?? {};
    this.peakYawDeg = peak.yawDegrees ?? 0;
    this.peakPitchDeg = peak.pitchDegrees ?? 15;

    const cam = metadata?.sourceCamera ?? {};
    const centroid = metadata?.centroid ?? [0, 0.5, 0];
    const pos = cam.position ?? [0, 1, 3];
    this.truthDir = this._normalize([
      pos[0] - centroid[0],
      pos[1] - centroid[1],
      pos[2] - centroid[2],
    ]);
  }

  _normalize(v) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return { x: v[0] / len, y: v[1] / len, z: v[2] / len };
  }

  _sphericalToDir(yawDeg, pitchDeg) {
    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    const cp = Math.cos(pitch);
    return { x: cp * Math.sin(yaw), y: Math.sin(pitch), z: cp * Math.cos(yaw) };
  }

  _angularDistanceDeg(a, b) {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z;
    const clamped = Math.max(-1, Math.min(1, dot));
    return (Math.acos(clamped) * 180) / Math.PI;
  }

  computeFromViewDirection(viewDir) {
    const thetaDeg = this._angularDistanceDeg(viewDir, this.truthDir);
    const thetaRad = (thetaDeg * Math.PI) / 180;
    const raw = Math.exp(-0.5 * (thetaRad / this.sigmaRad) ** 2);
    const clarity = this.floor + (this.ceiling - this.floor) * raw;
    return { clarity, thetaDeg };
  }

  computeFromYawPitch(yawDeg, pitchDeg) {
    const viewDir = this._sphericalToDir(yawDeg, pitchDeg);
    return this.computeFromViewDirection(viewDir);
  }

  getVisualParams(clarity) {
    const blurPx = Math.round((1 - clarity) * 12);
    const opacity = 0.35 + clarity * 0.65;
    const scale = 0.6 + clarity * 0.4;
    const noise = Math.max(0, 1 - clarity * 1.4);
    return { blurPx, opacity, scale, noise, clarity };
  }
}
