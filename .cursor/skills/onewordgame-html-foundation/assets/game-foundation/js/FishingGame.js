/**
 * 水族馆钓鱼 — HTML DOM 钓鱼循环
 * 阶段：cast → casting → wait → hookAlert → fight → result
 * 灵感来自 PlayCanvas fishing-game.js，纯 DOM/JS 实现
 */

const CFG = {
  BITE_WAIT_MIN: 2,
  BITE_WAIT_MAX: 6,
  HOOK_ALERT_SEC: 2.5,
  CAST_DURATION: 0.85,
  CAST_CHARGE_MAX: 1.6,
  TENSION_RISE_RATE: 0.38,
  TENSION_FALL_RATE: 0.28,
  TENSION_DAMP: 0.78,
  FISH_STRUGGLE: 0.09,
  ZONE_WIDTH: 0.30,
  ZONE_DRIFT_MIN: 0.11,
  ZONE_DRIFT_MAX: 0.24,
  ZONE_RETARGET_MIN: 0.85,
  ZONE_RETARGET_MAX: 1.9,
  FILL_RATE: 0.34,
  DRAIN_RATE: 0.12,
  RED_FAIL_SEC: 1.5,
  EXTREME_LO: 0.02,
  EXTREME_HI: 0.98,
  FIGHT_DURATION_MAX: 35,
};

const FISH_NAMES = [
  '霓虹小丑鱼', '蓝鳍金枪鱼', '发光水母', '珊瑚蝶鱼',
  '深海灯笼鱼', '条纹石斑', '银鳞沙丁', '幻彩斗鱼',
];

const HELP_STEPS = [
  { title: '1. 抛竿', text: '按住「抛竿」蓄力，松手抛出' },
  { title: '2. 等待', text: '观察浮漂，随机咬钩' },
  { title: '3. 提竿', text: '咬钩后限时点击/空格提竿' },
  { title: '4. 搏斗', text: '按住收线，保持指针在绿区' },
  { title: '5. 结算', text: '捕获条满即成功，红区过久断线' },
];

export class FishingGame {
  constructor(gameSpec, callbacks = {}) {
    this.spec = gameSpec;
    this.callbacks = callbacks;
    this.cfg = { ...CFG, ...(gameSpec.fishingConfig || {}) };

    this.sessionOpen = false;
    this.phase = 'idle';
    this.timer = 0;
    this.message = '按住「抛竿」蓄力，松手抛出浮漂';
    this.catches = 0;
    this.lastFish = '';
    this.lastQuality = 1;

    this.castCharging = false;
    this.castCharge = 0;
    this.castPower = 0.5;
    this.bobberY = 0.08;
    this.bobberWobble = 0;
    this.biteDelay = 3;
    this.biteAlert = false;
    this.hookFlash = 0;
    this.splashParts = [];

    this.zoneCenter = 0.5;
    this.zoneWidth = this.cfg.ZONE_WIDTH;
    this.zoneVel = 0;
    this.zoneTarget = 0.5;
    this.zoneRetarget = 1;
    this.zoneSpeed = 0.15;
    this.pointerPos = 0.5;
    this.pointerVel = 0;
    this.holdReel = false;
    this.catchProgress = 0;
    this.inZone = false;
    this.redTimer = 0;
    this.particles = [];
    this.failReason = '';
    this._rodReelActive = false;

    this._lastTs = performance.now();
    this._bindElements();
    this._bindEvents();
    this._render();
  }

  _bindElements() {
    this.els = {
      titleBadge: document.getElementById('title-badge'),
      catchCount: document.getElementById('catch-count'),
      phaseLabel: document.getElementById('phase-label'),
      message: document.getElementById('fishing-message'),
      waterPanel: document.getElementById('water-panel'),
      bobber: document.getElementById('bobber'),
      splashLayer: document.getElementById('splash-layer'),
      castPowerBar: document.getElementById('cast-power-bar'),
      castPowerWrap: document.getElementById('cast-power-wrap'),
      fightPanel: document.getElementById('fight-panel'),
      tensionTrack: document.getElementById('tension-track'),
      tensionZone: document.getElementById('tension-zone'),
      tensionPointer: document.getElementById('tension-pointer'),
      catchBar: document.getElementById('catch-bar'),
      catchBarWrap: document.getElementById('catch-bar-wrap'),
      helpSteps: document.getElementById('help-steps'),
      btnCast: document.getElementById('btn-cast'),
      btnHook: document.getElementById('btn-hook'),
      btnReel: document.getElementById('btn-reel'),
      btnAgain: document.getElementById('btn-again'),
      btnExit: document.getElementById('btn-exit'),
      btnReset: document.getElementById('btn-reset'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlayMsg: document.getElementById('overlay-msg'),
      overlayRestart: document.getElementById('overlay-restart'),
    };

    if (this.els.titleBadge) {
      this.els.titleBadge.textContent = this.spec.title ?? '水族馆钓鱼';
    }
    this._buildHelp();
    this._updateCatchDisplay();
  }

  _buildHelp() {
    if (!this.els.helpSteps) return;
    this.els.helpSteps.innerHTML = '';
    HELP_STEPS.forEach((step, i) => {
      const div = document.createElement('div');
      div.className = 'help-step';
      div.dataset.step = String(i);
      div.innerHTML = `<strong>${step.title}</strong><span>${step.text}</span>`;
      this.els.helpSteps.appendChild(div);
    });
  }

  _bindEvents() {
    const { btnCast, btnHook, btnReel, btnAgain, btnExit, btnReset, overlayRestart, waterPanel } = this.els;

    const startCast = (e) => {
      if (this.phase !== 'cast') return;
      e.preventDefault();
      this.castCharging = true;
      this.castCharge = 0;
      this._emitRodAction('castChargeStart');
    };
    const endCast = () => {
      if (this.phase === 'cast' && this.castCharging) this._releaseCast();
      this.castCharging = false;
      this.holdReel = false;
    };

    btnCast?.addEventListener('pointerdown', startCast);
    btnCast?.addEventListener('pointerup', endCast);
    btnCast?.addEventListener('pointerleave', endCast);
    btnCast?.addEventListener('pointercancel', endCast);

    waterPanel?.addEventListener('pointerdown', (e) => {
      if (this.phase === 'cast') startCast(e);
      if (this.phase === 'hookAlert') this._setupFight();
    });

    btnHook?.addEventListener('click', () => {
      if (this.phase === 'hookAlert') this._setupFight();
    });

    const reelDown = (e) => {
      if (this.phase !== 'fight') return;
      e.preventDefault();
      this.holdReel = true;
      if (!this._rodReelActive) {
        this._rodReelActive = true;
        this._emitRodAction('reelStart');
      }
    };
    const reelUp = () => {
      this.holdReel = false;
      if (this._rodReelActive) {
        this._rodReelActive = false;
        this._emitRodAction('reelStop');
      }
    };
    btnReel?.addEventListener('pointerdown', reelDown);
    btnReel?.addEventListener('pointerup', reelUp);
    btnReel?.addEventListener('pointerleave', reelUp);
    btnReel?.addEventListener('pointercancel', reelUp);

    btnAgain?.addEventListener('click', () => this._startSession());
    btnExit?.addEventListener('click', () => this.closeSession());
    btnReset?.addEventListener('click', () => this.callbacks.onReset?.());
    overlayRestart?.addEventListener('click', () => {
      this.els.overlay?.classList.remove('visible');
      this.callbacks.onExploreStart?.();
    });

    this._onKeyDown = (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.phase === 'hookAlert') this._setupFight();
        if (this.phase === 'fight') {
          this.holdReel = true;
          if (!this._rodReelActive) {
            this._rodReelActive = true;
            this._emitRodAction('reelStart');
          }
        }
        if (this.phase === 'cast' && !this.castCharging) {
          this.castCharging = true;
          this.castCharge = 0;
          this._emitRodAction('castChargeStart');
        }
      }
    };
    this._onKeyUp = (e) => {
      if (e.code === 'Space') {
        if (this.phase === 'cast' && this.castCharging) this._releaseCast();
        this.holdReel = false;
        if (this._rodReelActive) {
          this._rodReelActive = false;
          this._emitRodAction('reelStop');
        }
      }
    };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
  }

  tick(dt) {
    if (!this.sessionOpen) return;

    this.timer += dt;
    this.bobberWobble += dt * 3;

    switch (this.phase) {
      case 'cast':
        if (this.castCharging) {
          this.castCharge = Math.min(this.cfg.CAST_CHARGE_MAX, this.castCharge + dt);
          this._emitRodAction('castCharge', {
            charge: this.castCharge / this.cfg.CAST_CHARGE_MAX,
          });
        }
        break;

      case 'casting':
        if (this.timer >= this.cfg.CAST_DURATION) this._startWait();
        else {
          const t = this.timer / this.cfg.CAST_DURATION;
          this.bobberY = 0.05 + t * (0.55 + this.castPower * 0.22);
        }
        break;

      case 'wait':
        if (this.timer >= this.biteDelay) this._startHookAlert();
        break;

      case 'hookAlert':
        this.hookFlash = 0.5 + 0.5 * Math.sin(this.timer * 14);
        if (this.timer >= this.cfg.HOOK_ALERT_SEC) this._failHook();
        break;

      case 'fight':
        this._updateFight(dt);
        break;

      case 'result':
        this._updateParticles(dt);
        break;

      default:
        break;
    }

    if (this.phase === 'fight') {
      this._emitRodAction('fightTick', {
        reeling: this.holdReel,
        inZone: this.inZone,
        pointerPos: this.pointerPos,
        catchProgress: this.catchProgress,
      });
    }

    this._updateSplash(dt);
    this._render();
  }

  _clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  _rand(lo, hi) {
    return lo + Math.random() * (hi - lo);
  }

  _releaseCast() {
    if (this.phase !== 'cast') return;
    let power = Math.min(1, this.castCharge / this.cfg.CAST_CHARGE_MAX);
    if (power < 0.06) power = 0.06;
    this.castPower = power;
    this.castCharging = false;
    this.phase = 'casting';
    this.timer = 0;
    this.message = '浮漂落水…';
    this._emitRodAction('castRelease', { power });
    this._spawnSplash();
  }

  _startWait() {
    this.phase = 'wait';
    this.timer = 0;
    this.biteDelay = this._rand(this.cfg.BITE_WAIT_MIN, this.cfg.BITE_WAIT_MAX);
    this.biteAlert = false;
    this.bobberY = 0.58 + this.castPower * 0.22;
    this.message = '观察浮漂，等待咬钩…';
    this._emitRodAction('lineLanded', { power: this.castPower });
  }

  _startHookAlert() {
    this.phase = 'hookAlert';
    this.timer = 0;
    this.hookFlash = 1;
    this.biteAlert = true;
    this.bobberY = Math.min(0.88, this.bobberY + 0.04);
    this.message = '上钩了！点击或按空格提竿';
    this._emitRodAction('bite');
    this._spawnSplash();
  }

  _failHook() {
    this.failReason = 'miss';
    this.message = '反应慢了，鱼溜走了…';
    this.phase = 'result';
    this.timer = 0;
    this.lastFish = '';
    this._rodReelActive = false;
    this._emitRodAction('miss');
    this._spawnParticles(false);
  }

  _setupFight() {
    this.zoneCenter = 0.5;
    this.zoneVel = 0;
    this.zoneTarget = 0.35 + Math.random() * 0.3;
    this.zoneRetarget = this._rand(this.cfg.ZONE_RETARGET_MIN, this.cfg.ZONE_RETARGET_MAX);
    this.zoneSpeed = this._rand(this.cfg.ZONE_DRIFT_MIN, this.cfg.ZONE_DRIFT_MAX);
    this.pointerPos = 0.5;
    this.pointerVel = 0;
    this.catchProgress = 0.08;
    this.inZone = false;
    this.redTimer = 0;
    this.holdReel = false;
    this.failReason = '';
    this.phase = 'fight';
    this.timer = 0;
    this.message = '按住「收线」或空格，保持指针在绿区！';
    this._emitRodAction('hookSet');
  }

  _pointerInZone() {
    const half = this.zoneWidth * 0.5;
    return Math.abs(this.pointerPos - this.zoneCenter) <= half;
  }

  _updateFight(dt) {
    this.zoneRetarget -= dt;
    if (this.zoneRetarget <= 0) {
      this.zoneTarget = this._clamp(0.15 + Math.random() * 0.7, 0.12, 0.88);
      this.zoneRetarget = this._rand(this.cfg.ZONE_RETARGET_MIN, this.cfg.ZONE_RETARGET_MAX);
      this.zoneSpeed = this._rand(this.cfg.ZONE_DRIFT_MIN, this.cfg.ZONE_DRIFT_MAX);
    }

    const toTarget = this.zoneTarget - this.zoneCenter;
    this.zoneVel += toTarget * this.zoneSpeed * dt * 2;
    this.zoneVel *= 0.92;
    this.zoneCenter = this._clamp(this.zoneCenter + this.zoneVel * dt, 0.08, 0.92);

    const reel = this.holdReel;
    const targetVel = reel
      ? this.cfg.TENSION_RISE_RATE
      : -this.cfg.TENSION_FALL_RATE;
    this.pointerVel += (targetVel + (Math.random() - 0.5) * this.cfg.FISH_STRUGGLE) * dt;
    this.pointerVel *= this.cfg.TENSION_DAMP;
    this.pointerPos = this._clamp(this.pointerPos + this.pointerVel * dt, 0, 1);

    this.inZone = this._pointerInZone();

    if (this.pointerPos <= this.cfg.EXTREME_LO || this.pointerPos >= this.cfg.EXTREME_HI) {
      this._resolveCatch(false, 'snap');
      return;
    }

    if (this.inZone) {
      this.catchProgress += this.cfg.FILL_RATE * dt;
      this.redTimer = 0;
    } else {
      this.catchProgress -= this.cfg.DRAIN_RATE * dt;
      this.redTimer += dt;
      if (this.redTimer >= this.cfg.RED_FAIL_SEC) {
        this._resolveCatch(false, 'escape');
        return;
      }
    }

    this.catchProgress = this._clamp(this.catchProgress, 0, 1);

    if (this.catchProgress >= 1) {
      this._resolveCatch(true);
      return;
    }

    if (this.timer >= this.cfg.FIGHT_DURATION_MAX) {
      this._resolveCatch(false, 'timeout');
    }
  }

  _resolveCatch(success, reason) {
    this.holdReel = false;
    this._rodReelActive = false;
    this.phase = 'result';
    this.timer = 0;
    this.particles = [];

    if (!success) {
      this.failReason = reason || 'escape';
      this.message = this.failReason === 'snap'
        ? '线断了！再试一次吧'
        : this.failReason === 'timeout'
          ? '搏斗太久，鱼跑了…'
          : '鱼溜走了… 再试一次吧';
      this.lastFish = '';
      this._emitRodAction('catchFail', { reason: this.failReason });
      this._spawnParticles(false);
      return;
    }

    const fish = FISH_NAMES[Math.floor(Math.random() * FISH_NAMES.length)];
    const quality = 1 + Math.floor(Math.random() * 5);
    this.catches += 1;
    this.lastFish = fish;
    this.lastQuality = quality;
    this.message = `钓到了「${fish}」（品质 ${quality}）`;
    this._emitRodAction('catchSuccess', { fish, quality });
    this._spawnParticles(true);
    this._updateCatchDisplay();
  }

  _spawnSplash() {
    for (let i = 0; i < 8; i++) {
      this.splashParts.push({
        x: 48 + (Math.random() - 0.5) * 8,
        y: this.bobberY * 100,
        vx: (Math.random() - 0.5) * 30,
        vy: -20 - Math.random() * 30,
        life: 0.4 + Math.random() * 0.3,
        size: 3 + Math.random() * 4,
      });
    }
  }

  _updateSplash(dt) {
    for (let i = this.splashParts.length - 1; i >= 0; i--) {
      const p = this.splashParts[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      if (p.life <= 0) this.splashParts.splice(i, 1);
    }
  }

  _spawnParticles(success) {
    const colors = success ? ['#5ddf8a', '#7ee8fa', '#fff'] : ['#ff6b6b', '#ffaa44', '#888'];
    for (let i = 0; i < 16; i++) {
      this.particles.push({
        x: 40 + Math.random() * 20,
        y: 40 + Math.random() * 20,
        vx: (Math.random() - 0.5) * 50,
        vy: -30 - Math.random() * 40,
        life: 0.5 + Math.random() * 0.5,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 4 + Math.random() * 5,
      });
    }
  }

  _updateParticles(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 20 * dt;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  openSession() {
    this.sessionOpen = true;
    this._startSession();
  }

  closeSession() {
    this.sessionOpen = false;
    this.phase = 'idle';
    this.castCharging = false;
    this.holdReel = false;
    this._rodReelActive = false;
    this._emitRodAction('stow');
    this.callbacks.onClose?.();
    this._render();
  }

  _activeHelpStep() {
    const map = { cast: 0, casting: 0, wait: 1, hookAlert: 2, fight: 3, result: 4 };
    return map[this.phase] ?? -1;
  }

  _render() {
    const active = this._activeHelpStep();
    this.els.helpSteps?.querySelectorAll('.help-step').forEach((el, i) => {
      el.classList.toggle('active', i === active);
      el.classList.toggle('done', active >= 0 && i < active);
    });

    if (this.els.phaseLabel) {
      const labels = {
        idle: '—', cast: '抛竿', casting: '落水', wait: '等待', hookAlert: '提竿!',
        fight: '搏斗', result: '结算',
      };
      this.els.phaseLabel.textContent = labels[this.phase] ?? '';
    }

    this.els.btnExit?.classList.toggle('hidden', !this.sessionOpen);

    if (this.els.message) this.els.message.textContent = this.message;

    if (this.els.bobber) {
      const dip = this.phase === 'hookAlert' ? Math.sin(this.timer * 18) * 4 : Math.sin(this.bobberWobble) * 2;
      this.els.bobber.style.top = `calc(${this.bobberY * 100}% + ${dip}px)`;
      this.els.bobber.classList.toggle('bite', this.phase === 'hookAlert');
      this.els.bobber.classList.toggle('hidden', this.phase === 'cast' && !this.castCharging && this.timer === 0);
    }

    if (this.els.waterPanel) {
      this.els.waterPanel.classList.toggle('alert', this.phase === 'hookAlert');
    }

    const showCastPower = this.phase === 'cast' && this.castCharging;
    this.els.castPowerWrap?.classList.toggle('hidden', !showCastPower);
    if (showCastPower && this.els.castPowerBar) {
      const pct = Math.min(100, (this.castCharge / this.cfg.CAST_CHARGE_MAX) * 100);
      this.els.castPowerBar.style.width = `${pct}%`;
    }

    const showFight = this.phase === 'fight' || this.phase === 'result';
    this.els.fightPanel?.classList.toggle('hidden', !showFight);
    this.els.catchBarWrap?.classList.toggle('hidden', !showFight);

    if (this.phase === 'fight' || this.phase === 'result') {
      if (this.els.tensionZone) {
        const left = (this.zoneCenter - this.zoneWidth * 0.5) * 100;
        this.els.tensionZone.style.left = `${left}%`;
        this.els.tensionZone.style.width = `${this.zoneWidth * 100}%`;
      }
      if (this.els.tensionPointer) {
        this.els.tensionPointer.style.left = `${this.pointerPos * 100}%`;
        this.els.tensionPointer.classList.toggle('danger', !this.inZone && this.phase === 'fight');
      }
      if (this.els.catchBar) {
        this.els.catchBar.style.width = `${this.catchProgress * 100}%`;
      }
    }

    this.els.btnCast?.classList.toggle('hidden', this.phase !== 'cast');
    this.els.btnHook?.classList.toggle('hidden', this.phase !== 'hookAlert');
    this.els.btnReel?.classList.toggle('hidden', this.phase !== 'fight');
    this.els.btnAgain?.classList.toggle('hidden', this.phase !== 'result');

    if (this.els.btnHook) {
      this.els.btnHook.classList.toggle('pulse', this.phase === 'hookAlert');
    }

    this._renderSplash();
    this._renderParticles();
  }

  _renderSplash() {
    const layer = this.els.splashLayer;
    if (!layer) return;
    layer.innerHTML = '';
    this.splashParts.forEach((p) => {
      const dot = document.createElement('span');
      dot.className = 'splash-dot';
      dot.style.left = `${p.x}%`;
      dot.style.top = `${p.y}%`;
      dot.style.width = dot.style.height = `${p.size}px`;
      dot.style.opacity = String(this._clamp(p.life / 0.4, 0, 1));
      layer.appendChild(dot);
    });
  }

  _renderParticles() {
    const layer = this.els.splashLayer;
    if (!layer || this.phase !== 'result') return;
    this.particles.forEach((p) => {
      const dot = document.createElement('span');
      dot.className = 'result-particle';
      dot.style.left = `${p.x}%`;
      dot.style.top = `${p.y}%`;
      dot.style.background = p.color;
      dot.style.width = dot.style.height = `${p.size}px`;
      dot.style.opacity = String(this._clamp(p.life / 0.6, 0, 1));
      layer.appendChild(dot);
    });
  }

  _updateCatchDisplay() {
    if (this.els.catchCount) {
      this.els.catchCount.textContent = `${this.catches} 条`;
    }
  }

  _startSession() {
    this.phase = 'cast';
    this.timer = 0;
    this.message = '按住「抛竿」蓄力，松手抛出浮漂';
    this.castCharging = false;
    this.castCharge = 0;
    this._rodReelActive = false;
    this.bobberY = 0.08;
    this.biteAlert = false;
    this.splashParts = [];
    this.particles = [];
    this.failReason = '';
    this.lastFish = '';
    this.els.overlay?.classList.remove('visible');
    this._emitRodAction('ready');
    this._render();
  }

  reset() {
    this.catches = 0;
    this._updateCatchDisplay();
    if (this.sessionOpen) {
      this._startSession();
    }
  }

  _emitRodAction(type, detail = {}) {
    this.callbacks.onRodAction?.({
      type,
      phase: this.phase,
      ...detail,
    });
  }
}
