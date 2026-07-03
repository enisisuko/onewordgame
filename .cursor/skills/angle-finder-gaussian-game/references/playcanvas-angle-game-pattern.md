# PlayCanvas Angle Game Pattern

Minimal PlayCanvas architecture for **Find the Angle** identification games. Complements sibling skill UI patterns without requiring semantic billboards.

## Scene Hierarchy

```text
Application
├── Camera                    (script: orbit-camera.js)
├── DirectionalLight
├── SplatRoot
│   └── GaussianSplat         (sog loader component)
├── ClarityFX                 (script: clarity-controller.js, optional posteffect)
├── GameManager               (script: angle-game-manager.js)
└── 2D Screen
    ├── ClarityBar
    ├── CompassWidget
    ├── GuessPanel
    ├── TimerLabel
    └── ResultOverlay
```

## angle-game-manager.js State Machine

```text
loading → intro → playing → won | lost → restarting → intro
```

| State | Entry actions |
|-------|-----------------|
| loading | Fetch sog, parse clarity-curve.json |
| intro | Show title, correct answer hidden |
| playing | Enable orbit, start timer |
| won | Show answer, confetti optional |
| lost | Show answer, retry button |
| restarting | Reset camera, guesses, timer |

### Events

- `game:start` — intro → playing
- `game:guess` — payload `{ text }` → check win/fail
- `game:hint` — decrement hint budget
- `game:clarity_confirm` — player taps "I know what this is"
- `clarity:changed` — update UI meter
- `game:timeout` — playing → lost

## Guess UI Modes

### Text Input (`guessMode: "text"`)

- Single line input + submit button
- Normalize: trim, lowercase, optional Levenshtein ≤ 1 for typos

### Multiple Choice (`guessMode: "multi_choice"`)

- 4 buttons from `game-spec.json` → `choices[]`
- Used in fallback when symmetry risk high

## Clarity Bar

- Horizontal fill 0–100% bound to clarity
- Color gradient: `#446` → `#4f4` at threshold
- Pulse animation when crossing `clarityWinThreshold`

## Timer

```javascript
this._timeLeft -= dt;
if (this._timeLeft <= 0) this.app.fire('game:timeout');
```

Default 90s mobile; show MM:SS.

## Loading Gaussian Splat

Prefer company sog format from API `sog_url`:

1. Download to `assets/scene.sog` (or stream URL if CORS allows)
2. Attach to splat component per project loader
3. Center on `metadata.centroid`; scale to fit bounds

If loader unavailable, placeholder sphere + BUILD_REPORT warning.

## Touch (Loopit Mobile Partner)

```javascript
this.app.touch.on(pc.EVENT_TOUCHSTART, this._onTouchStart, this);
// Only orbit if not over UI:
if (UiLayout.isPointerOverCanvasUI(x, y)) return;
```

Partner requirements:

- Portrait-first layout
- Guess panel thumb-reachable bottom third
- No right-click dependencies

## Scripts to Generate

| File | Responsibility |
|------|----------------|
| `orbit-camera.js` | Drag orbit, optional zoom |
| `clarity-controller.js` | clarity → material/post |
| `angle-game-manager.js` | State, timer, guesses, win/lose |
| `clarity-meter-ui.js` | Bar + compass |
| `guess-panel-ui.js` | Text or multi-choice |

## MCP Upload Workflow

If deploying to PlayCanvas hosted project:

1. Prefer API token upload over MCP when token available
2. Use playcanvas MCP for asset/scene sync if no token
3. Never embed API keys in uploaded scripts

## Testing in Editor

1. Play mode: drag to orbit, verify clarity peaks at expected angle
2. Submit wrong guess 3× → lost
3. Submit correct → won
4. Restart resets all state
5. Resize to mobile aspect → UI still usable

## Difference from cloud-patched Explorer

Explorer (`labeled-gaussian-game-generator`) uses FPS + billboard ray-pick. Angle game uses **orbit only** — no `interactDistance`, no `BillboardUi.pickAll`.
