/**
 * explore ↔ fishing ↔ marker 模式机，对标 PlayCanvas GameManager。
 */
export class GameManager {
  constructor(callbacks = {}) {
    this.mode = 'explore';
    this.callbacks = callbacks;
    this._toastEl = document.getElementById('marker-toast');
    this._toastTimer = 0;
  }

  isExplore() {
    return this.mode === 'explore';
  }

  isFishing() {
    return this.mode === 'fishing';
  }

  isMarker() {
    return this.mode === 'marker';
  }

  enterExplore() {
    if (this.mode === 'explore') return;
    this.mode = 'explore';
    document.body.classList.remove('mode-fishing', 'mode-marker');
    document.body.classList.add('mode-explore');
    this.callbacks.onEnterExplore?.();
  }

  enterFishing(triggerInfo) {
    if (this.mode === 'fishing') return;
    this.mode = 'fishing';
    document.body.classList.remove('mode-explore', 'mode-marker');
    document.body.classList.add('mode-fishing');
    this.showToast(triggerInfo?.label ?? '进入钓鱼点');
    this.callbacks.onEnterFishing?.(triggerInfo);
  }

  enterMarker(triggerInfo) {
    if (this.mode === 'marker') return;
    this.mode = 'marker';
    document.body.classList.remove('mode-explore', 'mode-fishing');
    document.body.classList.add('mode-marker');
    this.callbacks.onEnterMarker?.(triggerInfo);
  }

  onMarkerTouch(info) {
    if (this.mode !== 'explore') return;
    if (info.type === 'fishing') {
      this.enterFishing(info);
      return;
    }
    if (info.type === 'dock' || info.type === 'shore') {
      this.enterMarker(info);
      return;
    }
    this.showToast(info.label ?? info.marker);
  }

  showToast(text, duration = 2.2) {
    if (!this._toastEl) return;
    this._toastEl.textContent = text;
    this._toastEl.classList.add('visible');
    this._toastTimer = duration;
  }

  tick(dt) {
    if (this._toastTimer > 0) {
      this._toastTimer -= dt;
      if (this._toastTimer <= 0) {
        this._toastEl?.classList.remove('visible');
      }
    }
  }
}
