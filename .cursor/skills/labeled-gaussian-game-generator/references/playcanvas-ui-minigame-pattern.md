# PlayCanvas UI Minigame Pattern (cloud-patched)

Source of truth: `C:\WORKS\playcanvas\scripts\cloud-patched\` (`game-manager.js`, `ui-layout.js`, `poker-game.js`, `pachinko-game.js`, `sleep-transition.js`, `shop-game.js`).

## GameManager mode machine

`GameManager.mode` is a string state machine. Two GM variants ship the same shell with different mode sets:

**Casino / explorer** (`cloud-patched/game-manager.js`, project 1551971):

| Mode | Player control | HUD | Typical entry |
|------|----------------|-----|---------------|
| `fps` | Unlocked (desktop keys / mobile joystick) | FPS HUD + aim hint | Default, exit from mini-games |
| `poker` | Locked | Hidden (panel anim exit) | `startPoker()` |
| `pachinko` | Locked | Hidden | `startPachinko()` |
| `sleep` | Locked | Hidden | `startSleep()` |

**Fishing sim** (`fishing/game-manager.js`, project 1552576):

| Mode | Player control | HUD | Typical entry |
|------|----------------|-----|---------------|
| `fps` | Unlocked | FPS HUD | Default, exit from mini-games |
| `fishing` | Locked | Hidden | `startFishing()` |
| `roast` | Locked | Hidden | `startRoastFish()` |
| `rest` | Locked | Hidden | `startRest()` |
| `shop` | Locked | Hidden | `openShop()` |

`setMode(mode)`:

- `fps`: unlock player, re-enable platform input, HUD enter anim; fishing GM also calls `_resetMarkerState()` (clears marker cooldowns + `WorldMarker.setInRangeByType(null)`)
- Other: release move keys, clear billboard hover / marker highlight, HUD exit anim, `app.fire('game:uiMode', mode)`

`_canInteract()` returns true only when `mode === 'fps'` — mini-games cannot chain-start from inside another mode.

## Event bus

| Event | Emitter | Listeners / effect |
|-------|---------|-------------------|
| `marker:touch` | `worldMarker` on contact/proximity (fishing) | `GameManager._onMarkerTouch` → `_tryMarkerAction(type)` |
| `marker:exit` | `worldMarker` on leave | `GameManager._onMarkerExit` (clears that marker's cooldown) |
| `game:enterPoker` | `GameManager.startPoker()` | `pokerGame.openSession()` |
| `game:enterPachinko` | `GameManager.startPachinko()` | `pachinkoGame.openSession()` |
| `game:enterSleep` | `GameManager.startSleep()` | `sleepTransition.startSleep()` |
| `game:enterFishing` | `GameManager.startFishing()` *(fishing)* | `fishingGame.openSession()` |
| `game:enterRoastFish` | `GameManager.startRoastFish()` *(fishing)* | `roastFishGame.openSession()` |
| `game:enterRest` | `GameManager.startRest()` *(fishing)* | `restTransition.startRest()` |
| `game:enterShop` | `GameManager.openShop()` *(fishing)* | `shopGame.openSession()` |
| `game:exitPoker` | `pokerGame.exitGame()` | close hook → `gm.setMode('fps')` |
| `game:uiMode` | `GameManager._applyUiVisibility()` | Any UI that needs mode-aware visibility |
| `game:gameOver` | `pokerGame._enterGameOver()` | Optional global game-over hook |

Character controller events (FPS only): `cc:move:*`, `cc:jump`, `cc:sprint`, `cc:crouch`, `cc:look`.

## How a marker/billboard opens the matching UI (closed loop)

The full round trip — waypoint contact (or billboard click) → mode switch → closed-loop UI → back to `fps`:

```text
[FPS] player walks into worldMarker  (OR clicks billboardUi within interactDistance)
  → marker:touch { type, marker }     (OR _triggerAimInteract from ray pick)
  → GameManager._onMarkerTouch        (mode==='fps' guard, per-marker 0.5s cooldown)
      → _tryMarkerAction(type) → start<Mode>()
          → resource/economy gate (energy / satiety / stamina / gold)
          → lockPlayer(); setMouseLocked(); setMode(<mode>)
          → app.fire('game:enter<Mode>')
  → <mode>Game.openSession()          (UiLayout Screen enabled, UiTheme enter anim)
  → ...player completes the mini-game loop (see states below)...
  → exit / complete:
      → app.fire('game:exit<Mode>')   (poker) or transition finishes (sleep/rest)
      → gm.setMode('fps'); gm.unlockPlayer()
  → [FPS] markers re-armed via _resetMarkerState()
```

One scene therefore hosts **a few waypoint markers** (each `interactionType` distinct) and **a few closed-loop UIs**,
one per mode — exactly the "几个路标 + 几个游戏 UI 闭环" structure.

## UiLayout Canvas panel pattern

All full-screen mini-games share the same bootstrap:

```javascript
this._screen = UiLayout.createScreen(this.app, priority);
this._screen.enabled = false;

var ui = UiLayout.createCanvasPanel(this.app, this._screen, 'PanelName', { useInput: true });
// ui.canvas, ui.ctx, ui.texture, ui.panel
```

| Constant | Value | Meaning |
|----------|-------|---------|
| `UiLayout.UI_W` | 720 | Design width |
| `UiLayout.UI_H` | 1280 | Design height (9:16 portrait) |
| `UiLayout.UI_LAYER` | 4 | Element layer for screen UI |

Screen priorities (draw order):

| Script | Screen priority |
|--------|-----------------|
| `gameManager` HUD | 100 |
| `pokerGame` | 110 |
| `pachinkoGame` | 110 |
| `shopGame` | 116 |
| `sleepTransition` | 120 |

Input binding for interactive panels:

```javascript
UiLayout.bindPanelInput(panel, app, {
    getPanelAnim: function () { return self._panelAnim; },
    onDown: function (x, y) { /* hit test buttons */ },
    onMove: function (x, y) { /* hover */ },
    onLeave: function () { /* clear hover */ }
});
```

Redraw loop:

1. Draw on Canvas2D `ctx` (use `UiTheme.*` helpers)
2. `UiLayout.uploadTexture(canvas, texture, app)` — applies lens warp to match 3D distortion
3. Hit tests use `UiLayout.pointerToHitCanvas` / `displayToHitCanvas` (inverse of warp + panel anim)

Portrait zones: `UiLayout.portraitZones({ fps: false, subBar: hasSubBar })` → `topBar`, `content`, `actionBar`, `hintBar`.

## Built-in mini-games

| Script | Entry event | Exit | Economy |
|--------|-------------|------|---------|
| `pokerGame` | `game:enterPoker` | Close → `gm.setMode('fps')`, `unlockPlayer()` | Entry costs **1 energy**; bets use **gold** (`spendGold`) |
| `pachinkoGame` | `game:enterPachinko` | Same | Entry **1 energy**; bets **gold**; payouts `addGold` |
| `sleepTransition` | `game:enterSleep` | Fade complete → `restoreEnergy(maxEnergy)`, toast, `fps` | **Free** — no energy cost |
| `shopGame` | `game:enterShop` | Close → `fps` | Buy/sell with **gold** *(fishing project)* |

### Trigger chain (cloud-patched)

```text
FPS aim at billboard (type poker|pachinko|sleep)
  → click / touch
  → GameManager._triggerAimInteract()
  → startPoker | startPachinko | startSleep
      → canSpendEnergy(1)?  [sleep skips energy]
      → lockPlayer(), setMouseLocked(), setMode(...)
      → app.fire('game:enter*')
  → *Game opens UiLayout screen, UiTheme enter anim
```

### Closed-loop state machines

Every mini-game is an explicit `this._phase` state machine with a **start → play → win/lose → restart/exit** cycle.
This is the "逻辑闭环" the generator must reproduce for each UI.

**`pokerGame` (blackjack)** — `_phase`:

```text
idle → betting → playing → result → (restart ⇒ betting | exit)
                      ↘ gold<=0 ⇒ gameover → (reset credits ⇒ betting | exit)
```

- `openSession()` (on `game:enterPoker`) → enable screen, reset, `_goToBetting()`
- `betting`: pick chip from `[5,10,25,50,100]`; `confirmBet()` → `spendGold(bet)` → `_startRound()`
- `playing`: `hit()` / `stand()`; bust or stand → `_finishRound()` (dealer draws to 17)
- `result`: `addGold(payout)` (win 2×, blackjack 2.5×, push 1×); buttons `restart` → `_goToBetting()`, `exit`
- `gameover` (gold ≤ 0): `gameOverReset` → `gm.resetGold()`, or `gameOverExit`
- `exitGame()`: panel exit anim → `game:exitPoker` → `gm.setMode('fps')` + `gm.unlockPlayer()`
- Keys: `F` hit, `E` stand, `R` restart, `Q`/`Esc` exit

**`pachinkoGame`** — same shell: `idle → betting → dropping → result → (restart | exit)`; ball physics with
asymmetric multiplier slots; `spendGold(bet)` on drop, `addGold(bet × slot.m)` on landing.

**`sleepTransition` / `restTransition`** — transition-style closed loop (no scoring):

```text
idle → fadeOut (0.9s) → hold (1.2s) → fadeIn (0.9s) → idle
```

- `startSleep()` (on `game:enterSleep`) → full-screen `UiTheme.drawRestScreen`
- On `hold` end: `gm.restoreEnergy(gm.maxEnergy)` (fishing: `restoreStamina()`)
- On `fadeIn` end: toast `REST COMPLETE — ENERGY RESTORED`, `gm.setMode('fps')`, `gm.unlockPlayer()`

**`fishingGame` / `roastFishGame` / `shopGame`** (fishing project) follow the identical `openSession()` →
phase machine → exit-to-`fps` contract, gated on satiety/stamina/gold instead of energy.

## Energy / gold gating

`GameManager` economy attributes:

| Attribute | Default | API |
|-----------|---------|-----|
| `maxEnergy` | 3 | Cap for `restoreEnergy` |
| `initialGold` | 100 | Starting credits |

| Action | Energy | Gold |
|--------|--------|------|
| Enter poker | `spendEnergy(1)` — blocked if `energy < 1`, toast `ENERGY LOW` | — |
| Enter pachinko | `spendEnergy(1)` | — |
| Enter sleep | None | None |
| Poker/pachinko bet | — | `canAfford` / `spendGold(bet)` — toast `INSUFFICIENT CREDITS` |
| Win round | — | `addGold(amount)` |

HUD displays energy segmented bar + gold chip via `UiTheme.drawFpsHud`.

When generating games from semantic scenes:

- Map **rest/sleep** labels to `sleep` billboards (energy loop)
- Map **gambling/table** labels to `poker` or `pachinko`
- Ensure at least one sleep interactable if mini-games consume energy
- Document starting `maxEnergy` / `initialGold` in `game-spec.json` and `BUILD_REPORT.md`

## Script upload note

Scripts that depend on `UiLayout` / `UiTheme` are uploaded with `ui-layout.js` prepended (`upload-cloud-patched.mjs`, `bundleUi: true`). Local reference: `C:\WORKS\playcanvas\scripts\upload-cloud-patched.mjs`.
