/**
 * 移动端虚拟摇杆（左下）+ 触摸环视（屏幕右半/上半）。
 * 探索模式启用；进入钓鱼小游戏时由 GameManager 调用 setEnabled(false)。
 */
export class MobileControls {
  constructor(canvas) {
    this.canvas = canvas;
    this.enabled = true;
    this.visible = MobileControls.isTouchPreferred();

    /** @type {{ x: number, z: number }} 归一化移动向量 */
    this.move = { x: 0, z: 0 };
    /** @type {{ dx: number, dy: number }} 本帧环视增量（弧度） */
    this.lookDelta = { dx: 0, dy: 0 };

    this._joystickActive = false;
    this._joystickPointerId = null;
    this._joystickCenter = { x: 0, y: 0 };
    this._joystickRadius = 48;

    this._lookActive = false;
    this._lookPointerId = null;
    this._lastLookX = 0;
    this._lastLookY = 0;

    this._root = document.getElementById('mobile-controls');
    this._base = document.getElementById('joystick-base');
    this._stick = document.getElementById('joystick-stick');

    if (this.visible && this._root) {
      this._root.classList.add('visible');
    }

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);

    canvas.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointercancel', this._onPointerUp);

    if (this._base) {
      this._base.addEventListener('pointerdown', (e) => this._startJoystick(e));
    }
  }

  static isTouchPreferred() {
    const narrow = window.matchMedia('(max-width: 639px)').matches;
    if (!narrow) return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) {
      this._resetJoystick();
      this._lookActive = false;
      this.lookDelta.dx = 0;
      this.lookDelta.dy = 0;
    }
    if (this._root) {
      this._root.classList.toggle('disabled', !on);
    }
  }

  /** 每帧开始时清零 lookDelta（由 PlayerController 消费） */
  beginFrame() {
    this.lookDelta.dx = 0;
    this.lookDelta.dy = 0;
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointercancel', this._onPointerUp);
  }

  _inJoystickZone(clientX, clientY) {
    const rect = this._base?.getBoundingClientRect();
    if (!rect) return false;
    const pad = 24;
    return (
      clientX >= rect.left - pad &&
      clientX <= rect.right + pad &&
      clientY >= rect.top - pad &&
      clientY <= rect.bottom + pad
    );
  }

  _inLookZone(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;
    const bottomSafe = Math.min(h * 0.38, 220);
    return relX > w * 0.42 && relY < h - bottomSafe;
  }

  _onPointerDown(e) {
    if (!this.enabled || !this.visible) return;
    if (this._inJoystickZone(e.clientX, e.clientY)) {
      this._startJoystick(e);
      return;
    }
    if (this._inLookZone(e.clientX, e.clientY) && e.target === this.canvas) {
      this._startLook(e);
    }
  }

  _startJoystick(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = this._base.getBoundingClientRect();
    this._joystickCenter = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
    this._joystickActive = true;
    this._joystickPointerId = e.pointerId;
    try {
      (e.currentTarget || this._base).setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
    this._updateJoystick(e.clientX, e.clientY);
  }

  _startLook(e) {
    if (e.button !== undefined && e.button !== 0) return;
    this._lookActive = true;
    this._lookPointerId = e.pointerId;
    this._lastLookX = e.clientX;
    this._lastLookY = e.clientY;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch (_) {
      /* ignore */
    }
  }

  _onPointerMove(e) {
    if (!this.enabled) return;
    if (this._joystickActive && e.pointerId === this._joystickPointerId) {
      e.preventDefault();
      this._updateJoystick(e.clientX, e.clientY);
      return;
    }
    if (this._lookActive && e.pointerId === this._lookPointerId) {
      e.preventDefault();
      const dx = e.clientX - this._lastLookX;
      const dy = e.clientY - this._lastLookY;
      this._lastLookX = e.clientX;
      this._lastLookY = e.clientY;
      this.lookDelta.dx -= dx * 0.004;
      this.lookDelta.dy -= dy * 0.004;
    }
  }

  _onPointerUp(e) {
    if (e.pointerId === this._joystickPointerId) {
      this._resetJoystick();
    }
    if (e.pointerId === this._lookPointerId) {
      this._lookActive = false;
      this._lookPointerId = null;
    }
  }

  _updateJoystick(clientX, clientY) {
    const dx = clientX - this._joystickCenter.x;
    const dy = clientY - this._joystickCenter.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const max = this._joystickRadius;
    const clamped = Math.min(dist, max);
    const angle = Math.atan2(dy, dx);
    const nx = (Math.cos(angle) * clamped) / max;
    const ny = (Math.sin(angle) * clamped) / max;

    // 屏幕坐标：上为负 y → 与 WASD 一致（mz<0 前进）
    this.move.x = nx;
    this.move.z = ny;

    if (this._stick) {
      const offsetX = Math.cos(angle) * clamped;
      const offsetY = Math.sin(angle) * clamped;
      this._stick.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
    }
  }

  _resetJoystick() {
    this._joystickActive = false;
    this._joystickPointerId = null;
    this.move.x = 0;
    this.move.z = 0;
    if (this._stick) {
      this._stick.style.transform = 'translate(-50%, -50%)';
    }
  }
}
