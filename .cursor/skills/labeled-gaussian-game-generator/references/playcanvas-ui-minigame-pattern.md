# PlayCanvas UI Minigame Pattern (cloud-patched)

Source of truth: `C:\WORKS\playcanvas\scripts\cloud-patched\` (`game-manager.js`, `ui-layout.js`, `poker-game.js`, `pachinko-game.js`, `sleep-transition.js`, `shop-game.js`).

## GameManager mode machine

`GameManager.mode` is a string state machine:

| Mode | Player control | HUD | Typical entry |
|------|----------------|-----|---------------|
| `fps` | Unlocked (desktop keys / mobile joystick) | FPS HUD + aim hint | Default, exit from mini-games |
| `poker` | Locked | Hidden (panel anim exit) | `startPoker()` |
| `pachinko` | Locked | Hidden | `startPachinko()` |
| `sleep` | Locked | Hidden | `startSleep()` |
| `shop` | Locked | Hidden | `shopGame` → `gm.setMode('shop')` *(fishing/shop stack)* |

`setMode(mode)`:

- `fps`: unlock player, re-enable platform input, HUD enter anim
- Other: release move keys, clear billboard hover, HUD exit anim, `app.fire('game:uiMode', mode)`

`_canInteract()` returns true only when `mode === 'fps'` — mini-games cannot chain-start from inside another mode.

## Event bus

| Event | Emitter | Listeners / effect |
|-------|---------|-------------------|
| `game:enterPoker` | `GameManager.startPoker()` | `pokerGame.openSession()` |
| `game:enterPachinko` | `GameManager.startPachinko()` | `pachinkoGame.openSession()` |
| `game:enterSleep` | `GameManager.startSleep()` | `sleepTransition.startSleep()` |
| `game:enterShop` | *(fishing game-manager)* | `shopGame.openSession()` |
| `game:uiMode` | `GameManager._applyUiVisibility()` | Any UI that needs mode-aware visibility |

Character controller events (FPS only): `cc:move:*`, `cc:jump`, `cc:sprint`, `cc:crouch`, `cc:look`.

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

### Poker / Pachinko flow

1. `openSession()` — enable screen, reset state
2. If `gold <= 0` → game over panel
3. `_goToBetting()` — select bet from `[5, 10, 25, 50, 100]`
4. `confirmBet()` → `spendGold(selectedBet)` → play round
5. Win/lose → `addGold(payout)` or bust
6. Exit button → panel exit anim → `setMode('fps')`

### Sleep flow

1. `startSleep()` — full-screen `UiTheme.drawRestScreen`
2. Phases: `fadeOut` → `hold` (default 1.2s) → `fadeIn`
3. On hold end: `gm.restoreEnergy(gm.maxEnergy)`
4. Complete: toast `REST COMPLETE — ENERGY RESTORED`, return to `fps`

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
