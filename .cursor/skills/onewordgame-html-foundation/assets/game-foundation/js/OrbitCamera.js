/**
 * Orbit camera around a pivot with mouse + touch drag and optional zoom.
 */
export class OrbitCamera {
  constructor(camera, domElement, pivot = { x: 0, y: 0.5, z: 0 }) {
    this.camera = camera;
    this.domElement = domElement;
    this.pivot = pivot;

    this.radius = 3.5;
    this.minRadius = 1.5;
    this.maxRadius = 8;
    this.yaw = 0;
    this.pitch = 0.15;
    this.minPitch = -0.3;
    this.maxPitch = 1.2;

    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.totalRotationDeg = 0;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onWheel = this._onWheel.bind(this);

    domElement.addEventListener('pointerdown', this._onPointerDown);
    domElement.addEventListener('pointermove', this._onPointerMove);
    domElement.addEventListener('pointerup', this._onPointerUp);
    domElement.addEventListener('pointercancel', this._onPointerUp);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  setAngles(yawRad, pitchRad) {
    this.yaw = yawRad;
    this.pitch = pitchRad;
    this._clampPitch();
    this.update();
  }

  setStartOffset(yawDeg, pitchDeg) {
    this.yaw = (yawDeg * Math.PI) / 180;
    this.pitch = (pitchDeg * Math.PI) / 180;
    this._clampPitch();
    this.update();
  }

  getViewDirection() {
    const cp = Math.cos(this.pitch);
    return {
      x: cp * Math.sin(this.yaw),
      y: Math.sin(this.pitch),
      z: cp * Math.cos(this.yaw),
    };
  }

  getYawPitchDegrees() {
    return {
      yawDegrees: (this.yaw * 180) / Math.PI,
      pitchDegrees: (this.pitch * 180) / Math.PI,
    };
  }

  resetRotationBudget() {
    this.totalRotationDeg = 0;
  }

  update() {
    const { x: px, y: py, z: pz } = this.pivot;
    const cp = Math.cos(this.pitch);
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    this.camera.position.set(
      px + this.radius * cp * sinY,
      py + this.radius * Math.sin(this.pitch),
      pz + this.radius * cp * cosY
    );
    this.camera.lookAt(px, py, pz);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('wheel', this._onWheel);
  }

  _clampPitch() {
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
  }

  _onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this.isDragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
    this.domElement.setPointerCapture(e.pointerId);
  }

  _onPointerMove(e) {
    if (!this.isDragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX;
    this.lastY = e.clientY;

    const rotDeg = Math.sqrt(dx * dx + dy * dy) * 0.35;
    this.totalRotationDeg += rotDeg;

    this.yaw -= dx * 0.005;
    this.pitch += dy * 0.005;
    this._clampPitch();
    this.update();
  }

  _onPointerUp(e) {
    if (!this.isDragging) return;
    this.isDragging = false;
    try {
      this.domElement.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  _onWheel(e) {
    e.preventDefault();
    this.radius += e.deltaY * 0.005;
    this.radius = Math.max(this.minRadius, Math.min(this.maxRadius, this.radius));
    this.update();
  }
}
