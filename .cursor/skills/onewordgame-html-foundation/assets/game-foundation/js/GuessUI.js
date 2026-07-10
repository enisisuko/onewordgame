/**
 * Guess panel, timer, clarity meter, overlay, and game state UI.
 */
export class GuessUI {
  constructor(gameSpec, callbacks) {
    this.spec = gameSpec;
    this.callbacks = callbacks;
    this.state = 'playing';
    this.wrongGuesses = 0;
    this.hintsUsed = 0;
    this.timeLeft = gameSpec.loseCondition?.timerSeconds ?? 60;
    this.maxWrong = gameSpec.loseCondition?.maxWrongGuesses ?? 3;
    this.winThreshold = gameSpec.clarityConfig?.winThreshold ?? 0.85;
    this.maxHints = gameSpec.clarityConfig?.maxHints ?? 2;
    this.currentClarity = 0;

    this.els = {
      timer: document.getElementById('timer'),
      wrongCount: document.getElementById('wrong-count'),
      clarityBar: document.getElementById('clarity-bar'),
      clarityThreshold: document.getElementById('clarity-threshold'),
      clarityValue: document.getElementById('clarity-value'),
      hintText: document.getElementById('hint-text'),
      guessPanel: document.getElementById('guess-panel'),
      btnReset: document.getElementById('btn-reset'),
      btnHint: document.getElementById('btn-hint'),
      btnConfirm: document.getElementById('btn-confirm'),
      overlay: document.getElementById('overlay'),
      overlayTitle: document.getElementById('overlay-title'),
      overlayMsg: document.getElementById('overlay-msg'),
      overlayRestart: document.getElementById('overlay-restart'),
      titleBadge: document.getElementById('title-badge'),
    };

    this.els.clarityThreshold.style.left = `${this.winThreshold * 100}%`;
    this.els.titleBadge.textContent = gameSpec.title ?? '找角度游戏';

    this._buildChoices();
    this._bindEvents();
    this._startTimer();
    this._updateWrongDisplay();
  }

  _buildChoices() {
    const label = this.spec.targetLabel ?? '咖啡杯';
    const distractors = this.spec.distractors ?? ['茶壶', '花瓶', '马克杯'];
    const choices = [label, ...distractors.slice(0, 3)];
    this._shuffle(choices);

    this.els.guessPanel.innerHTML = '';
    choices.forEach((text) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'guess-btn';
      btn.textContent = text;
      btn.addEventListener('click', () => this._onGuess(text, btn));
      this.els.guessPanel.appendChild(btn);
    });
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  _bindEvents() {
    this.els.btnReset.addEventListener('click', () => this.callbacks.onReset());
    this.els.btnHint.addEventListener('click', () => this._useHint());
    this.els.btnConfirm.addEventListener('click', () => this._onConfirm());
    this.els.overlayRestart.addEventListener('click', () => this.callbacks.onReset());
  }

  _startTimer() {
    this._updateTimerDisplay();
    if (this._timerId) clearInterval(this._timerId);
    this._timerId = setInterval(() => {
      if (this.state !== 'playing') return;
      this.timeLeft -= 1;
      this._updateTimerDisplay();
      if (this.timeLeft <= 0) {
        this._endGame('lose', '时间到！没能认出物体。');
      }
    }, 1000);
  }

  _updateTimerDisplay() {
    const m = Math.floor(this.timeLeft / 60);
    const s = this.timeLeft % 60;
    this.els.timer.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  _updateWrongDisplay() {
    this.els.wrongCount.textContent = `错误 ${this.wrongGuesses}/${this.maxWrong}`;
  }

  updateClarity(clarity) {
    this.currentClarity = clarity;
    const pct = Math.round(clarity * 100);
    this.els.clarityBar.style.width = `${pct}%`;
    this.els.clarityValue.textContent = `${pct}%`;

    if (clarity >= this.winThreshold) {
      this.els.hintText.textContent = '✨ 已经很清晰了，快猜猜看！';
    } else if (clarity >= 0.5) {
      this.els.hintText.textContent = '继续旋转，越来越清楚了…';
    } else {
      this.els.hintText.textContent = '单指/鼠标拖拽环绕观察';
    }
  }

  _normalize(s) {
    return s.trim().toLowerCase();
  }

  _isCorrect(guess) {
    const target = this.spec.targetLabel ?? '';
    if (this._normalize(guess) === this._normalize(target)) return true;
    const synonyms = this.spec.synonyms ?? [];
    return synonyms.some((s) => this._normalize(s) === this._normalize(guess));
  }

  _onGuess(text, btn) {
    if (this.state !== 'playing') return;

    if (this._isCorrect(text)) {
      btn.classList.add('correct');
      this._endGame('win', `答对了！这是「${this.spec.targetLabel}」。`);
      return;
    }

    btn.classList.add('wrong');
    btn.disabled = true;
    this.wrongGuesses += 1;
    this._updateWrongDisplay();

    if (this.wrongGuesses >= this.maxWrong) {
      this._endGame('lose', `错误次数用尽。正确答案是「${this.spec.targetLabel}」。`);
    }
  }

  _onConfirm() {
    if (this.state !== 'playing') return;
    if (this.currentClarity < this.winThreshold * 0.5) {
      this.els.hintText.textContent = '还不够清晰，再转一转角度吧！';
      return;
    }
    this.els.hintText.textContent = '请从下方选项中选择你的答案';
  }

  _useHint() {
    if (this.state !== 'playing' || this.hintsUsed >= this.maxHints) return;
    this.hintsUsed += 1;
    const label = this.spec.targetLabel ?? '';
    const hint = `提示：答案是${label.length}个字，首字「${label[0]}」`;
    this.els.hintText.textContent = hint;
    this.callbacks.onHint?.(this.spec.clarityConfig?.hintBoost ?? 0.25);
    if (this.hintsUsed >= this.maxHints) {
      this.els.btnHint.disabled = true;
      this.els.btnHint.style.opacity = '0.4';
    }
  }

  _endGame(result, message) {
    this.state = result;
    clearInterval(this._timerId);
    this.els.overlayTitle.textContent = result === 'win' ? '🎉 胜利！' : '😢 失败';
    this.els.overlayMsg.textContent = message;
    this.els.overlay.classList.add('visible');
    this.callbacks.onGameEnd?.(result);
  }

  reset() {
    this.state = 'playing';
    this.wrongGuesses = 0;
    this.hintsUsed = 0;
    this.timeLeft = this.spec.loseCondition?.timerSeconds ?? 60;
    this.currentClarity = 0;
    this.els.overlay.classList.remove('visible');
    this.els.btnHint.disabled = false;
    this.els.btnHint.style.opacity = '1';
    this._buildChoices();
    this._updateWrongDisplay();
    this._startTimer();
    this.updateClarity(0);
  }

  checkRotationBudget(degrees, budget) {
    if (!budget || budget <= 0) return false;
    if (degrees > budget) {
      this._endGame('lose', '旋转次数过多，视线迷失了…');
      return true;
    }
    return false;
  }
}
