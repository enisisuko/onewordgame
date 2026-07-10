/**
 * 路标互动面板 — dock / shore 等无完整小游戏时的可关闭说明面板。
 */
const PANEL_CONTENT = {
  dock: {
    title: '🪵 木质码头',
    body: '你站在吱呀作响的木栈道上，海风吹来咸湿的气息。远处渔船缓缓驶过海湾，木桩上挂着风化的渔网。这里是眺望海岸、稍作休息的好地方。',
  },
  shore: {
    title: '🏖️ 浅水区',
    body: '清澈的海水没过脚踝，细沙在趾间流动。小螃蟹飞快地躲进礁石缝隙，退潮后能看到贝壳与海星。这里水太浅，不适合抛竿钓鱼。',
  },
};

export class MarkerPanelGame {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.sessionOpen = false;
    this._root = document.getElementById('marker-panel');
    this._title = document.getElementById('marker-panel-title');
    this._body = document.getElementById('marker-panel-msg');
    this._dismiss = document.getElementById('marker-panel-dismiss');

    this._dismiss?.addEventListener('click', () => this.closeSession());
  }

  openSession(info) {
    const content = PANEL_CONTENT[info?.type] ?? {
      title: info?.label ?? '路标',
      body: '你来到了场景中的一处地点，四周景色宜人。',
    };
    if (this._title) this._title.textContent = content.title;
    if (this._body) this._body.textContent = content.body;
    this._root?.classList.add('visible');
    this.sessionOpen = true;
  }

  closeSession() {
    if (!this.sessionOpen) return;
    this._root?.classList.remove('visible');
    this.sessionOpen = false;
    this.callbacks.onClose?.();
  }

  tick() {
    /* no-op */
  }
}
