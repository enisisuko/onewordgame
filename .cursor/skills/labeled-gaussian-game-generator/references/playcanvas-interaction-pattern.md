# PlayCanvas Interaction Pattern

Two in-world interaction paradigms bind semantic labels to gameplay in FPS exploration mode:

- **Billboard ray-pick** — `C:\WORKS\playcanvas\scripts\cloud-patched\` (`game-manager.js`, `billboard-ui.js`). Aim + click a floating panel within `interactDistance`.
- **Waypoint marker + contact trigger** — `C:\WORKS\playcanvas\scripts\fishing\` (`world-marker.js`, `game-manager.js`). Walk into a spatial marker; it fires `marker:touch`.

Both feed the same GameManager mode machine and open the same style of closed-loop Canvas UIs (see `playcanvas-ui-minigame-pattern.md`).

## GameManager.interactDistance

| Attribute | Default | Role |
|-----------|---------|------|
| `interactDistance` | **12** | Max ray-hit distance (world units) for billboard pick |

`GameManager` reads the camera + pointer each frame in FPS mode:

1. `_updateAimFromMouse` — hover highlight via `BillboardUi.pickAll(..., this.interactDistance)`
2. `_handleFpsPointerInteract` — click/touch fires `_triggerAimInteract` on the same pick

Tune `interactDistance` on the `gameManager` script entity if billboards feel too far/near. Keep billboard placement within this radius from typical player stand points.

## BillboardUi ray pick

`BillboardUi` registers instances globally and exposes static pick helpers:

```text
client (DOM) → clientToCameraScreen → camera.screenToWorld (near/far)
  → pickFromRay → per-instance _rayHit (plane intersection + AABB)
  → nearest hit within maxDistance
```

| Step | API | Notes |
|------|-----|-------|
| Screen coords | `BillboardUi.clientToCameraScreen(clientX, clientY, app)` | Top-left origin; **do not** pass through `UiLayout` lens/hit transforms |
| Ray pick | `BillboardUi.pickAll(app, clientX, clientY, cameraEntity, maxDistance)` | Returns `{ type, dist, entity, instance }` or `null` |
| Hover | `BillboardUi.setHoverByType(type)` | Highlights all billboards matching `interactionType` |

Hit test requirements (`_rayHit`):

- Entity enabled, `element` present, `_interactionType` non-empty
- Hit distance ≤ `maxDistance` (from `GameManager.interactDistance`)
- Hit point inside billboard plane half-extents (world-scaled panel size)

`GameManager._triggerAimInteract` maps `pick.type`:

| `interactionType` | GameManager action |
|-------------------|-------------------|
| `poker` | `startPoker()` |
| `pachinko` | `startPachinko()` |
| `sleep` | `startSleep()` |

Clicks over Canvas2D HUD are ignored via `UiLayout.isPointerOverCanvasUI(..., { fpsHud: true, checkScreens: true })`.

## Semantic label → interactionType

Set `billboardUi.interactionType` explicitly when placing entities. If empty, `_resolveInteractionType()` infers from **entity name** (lowercase substring).

| Semantic label / affordance | Suggested `interactionType` | `labelText` hint | Mini-game |
|----------------------------|----------------------------|------------------|-----------|
| table, desk, poker_table, card_table | `poker` | POKER | Poker (blackjack-style) |
| pachinko, slot, arcade, pinball | `pachinko` | PACHINKO | Pachinko |
| bed, couch, sofa, rest_area, sleep | `sleep` | REST | Sleep / energy restore |
| shop, vendor, store, counter | *(not wired in cloud-patched GM)* | SHOP | `shopGame` listens to `game:enterShop` only |
| water, pond, lake, river | *(fishing project)* | 钓鱼 | `worldMarker` + `fishing` in `scripts/fishing/` |

Confidence rules for label binding:

- confidence ≥ 0.85: bind billboard at label `position` / bounds center
- 0.60–0.85: bind only if surface is reachable and faces player approach
- &lt; 0.60: do not use as sole interactable; add synthetic anchor in `BUILD_REPORT.md`

## Entity setup (billboardUi + element)

Minimum hierarchy for cloud-patched casino / explorer scenes:

```text
Interact_<LabelId>          (script: billboardUi)
  └── Element               (optional child; script finds self or child with element)
```

Script attributes:

| Attribute | Default | Purpose |
|-----------|---------|---------|
| `labelText` | `Label` | Canvas2D label drawn on panel |
| `interactionType` | `''` | `poker` \| `pachinko` \| `sleep` |
| `panelWidth` | 512 | Element width (px) |
| `panelHeight` | 256 | Element height (px) |

Runtime setup (in `initialize`):

- Requires **element** component (`pc.ELEMENTTYPE_IMAGE`)
- Procedural canvas → texture; layer **4**; `drawOrder` 1000; double-sided material (`cull: NONE`, `depthWrite: false`)
- Position billboard facing playable area; scale entity so world half-extents match intended click target

MCP placement workflow: see `playcanvas-mcp-workflow.md` (`create_entities` → `add_components` element + script → `add_script_component_script` for `billboardUi` asset).

## Waypoint Marker + Contact Trigger (fishing project)

Source of truth: `C:\WORKS\playcanvas\scripts\fishing\world-marker.js` + `fishing\game-manager.js`.
This is the **"a few spatial waypoints, each firing an event on contact"** pattern. Prefer it when the
player physically **walks up to** an object (floor-level water / grill / bed / stall) rather than clicking a sign.

### `worldMarker` script attributes

| Attribute | Default | Role |
|-----------|---------|------|
| `interactionType` | `''` | `fishing` \| `roast` \| `rest` \| `shop` — empty ⇒ inferred from entity **name** |
| `labelText` | `''` | Billboard label; falls back to type default (钓鱼/烤鱼/休息/商店) |
| `triggerRadius` | **0.9** m | Sphere trigger radius; **clamped to ≥ 0.5** in `getTriggerRadius()` |
| `markerSize` | 1.0 | Visual scale of the inverted-pyramid mesh |
| `labelOffsetY` | 1.5 m | Height of the floating label above the anchor |
| `rotSpeed` / `rotSpeedActive` | 72 / 120 °/s | Idle vs in-range spin |
| `bobSpeed` / `bobAmp` | 2.0 / 0.15 m | Vertical bob |
| `glowPulseSpeed` / `emissiveBase` / `emissiveActive` | 3.0 / 2.5 / 5.0 | Emissive pulse; brighter when player in range |

Name inference (`_resolveInteractionType`, lowercase substring): `fish`/`poker`→`fishing`,
`roast`/`pachinko`→`roast`, `sleep`/`rest`→`rest`, `shop`→`shop`.

### Trigger volume (self-provisioned at runtime)

`_buildTriggerCollision()` (called in `initialize` **and** `postInitialize`) guarantees a pure trigger:

```javascript
entity.addComponent('collision', {
    type: 'sphere',
    radius: this.getTriggerRadius(),   // triggerRadius, min 0.5
    trigger: true,                     // PURE trigger — no rigidbody on the marker
    linearOffset: [0, 0, 0]
});
// group = 1, mask = 0xffff; any existing rigidbody is removed
col.on('triggerenter', this._onTriggerEnter, this);
col.on('triggerleave', this._onTriggerExit, this);
```

> **MCP caveat:** the MCP `collision` schema has **no `trigger` / `group` / `mask` fields**. Do **not** try to
> author the trigger through MCP. Create the marker entity + attach the `worldMarker` script; the script builds
> the sphere trigger (plus mesh + label) itself on `initialize`. See `playcanvas-scene-wiring.md`.

### Dual detection: contact trigger + proximity fallback

`worldMarker` fires on **either** path, so it never misses even if the player controller has no rigidbody contact:

| Path | Where | Condition |
|------|-------|-----------|
| Physics contact | `_onTriggerEnter` (`triggerenter`) | Player collider enters the sphere trigger |
| Proximity | `_updateProximityTouch()` every `postUpdate` | `distSq3D ≤ (triggerRadius + 0.35)²`, where `distSq3D = dxz² + dy²·0.25` |

Player identity (`_isPlayer`): walks the contact entity's parent chain until it matches `app.gameManager.player`
or an entity carrying the `character-controller` script.

### Event emission

```javascript
// on enter (0.3s debounce, ONLY while gm.mode === 'fps')
this.app.fire('marker:touch', { type: this._interactionType, marker: this });
// on leave
this.app.fire('marker:exit',  { type: this._interactionType, marker: this });
```

Payload is `{ type, marker }` where `marker` is the `worldMarker` instance (`marker.entity` is the PlayCanvas entity).

### GameManager consumption (fishing)

`_bindMarkerEvents()` wires the bus; `_onMarkerTouch` gates + routes:

```text
app.on('marker:touch') → _onMarkerTouch(payload)
  guard: gm.mode === 'fps' && payload.type
  per-marker cooldown keyed by marker.entity.getGuid(), markerTouchCooldown = 0.5s
  → _tryMarkerAction(type)
       fishing → startFishing()   → game:enterFishing
       rest    → startRest()      → game:enterRest
       roast   → startRoastFish() → game:enterRoastFish
       shop    → openShop()       → game:enterShop
  each start(): _canInteract() (mode fps) + resource check → lockPlayer() → setMode(mode) → app.fire('game:enter*')
```

Returning to `fps` calls `_resetMarkerState()` → clears cooldowns + `WorldMarker.setInRangeByType(null)`.

Static registry helpers: `WorldMarker._instances`, `setInRangeByType(type)` (emissive highlight only),
`findClosest(playerPos, minRadius)`, `getRegisteredCount()`.

## Choosing the trigger style: collision-trigger vs proximity vs ray-pick

| Interaction | Script | When to use | Requires |
|-------------|--------|-------------|----------|
| **Contact trigger** (walk-into) | `worldMarker` | Floor-level, reachable object; player collider present | `collision.glb` / walkable floor; player has collider |
| **Proximity distance** (walk-near) | `worldMarker` (built-in fallback) | Same as above but player controller is kinematic / no reliable contact | Only `gm.player` position — always safe |
| **Ray pick** (aim + click) | `billboardUi` | Vertical sign / distant / mouse-driven selection (casino) | Billboard faces player; within `interactDistance` (12) |

Decision rules for the generator:

- Reachable floor object + collision available → **`worldMarker`** (contact trigger; proximity auto-covers gaps).
- Wall-mounted / elevated / must be selected at a distance, or no reliable collision → **`billboardUi`** (ray pick).
- confidence ≥ 0.85 → primary interactable; 0.60–0.85 → only if reachable and faces the player approach;
  &lt; 0.60 → synthetic anchor documented in `BUILD_REPORT.md`.
- **Never** put both `worldMarker` and `billboardUi` on the same interactable (double-fire).

## Semantic label → marker type

Set `interactionType` explicitly; leave empty only if the entity name already encodes the hint.

| Semantic label / affordance | worldMarker `type` | billboardUi `type` | Mini-game / effect |
|-----------------------------|--------------------|--------------------|--------------------|
| water, pond, lake, river | `fishing` | — | Fishing (`game:enterFishing`) |
| grill, campfire, stove, bbq | `roast` | — | Roast fish (`game:enterRoastFish`) |
| bed, tent, campfire_rest, rest_area | `rest` | `sleep` | Rest / energy restore |
| shop, stall, vendor, counter | `shop` | *(shop only via GM)* | Shop buy/sell (`game:enterShop`) |
| table, desk, poker_table, card_table | — | `poker` | Blackjack (`game:enterPoker`) |
| pachinko, slot, arcade, pinball | — | `pachinko` | Pachinko (`game:enterPachinko`) |
| door, gate, exit | *(generic exit marker)* | — | Level exit / scene transition |

## Reference paths

| File | Role |
|------|------|
| `cloud-patched/game-manager.js` | `interactDistance`, ray-pick aim, mode transitions (casino) |
| `cloud-patched/billboard-ui.js` | Ray pick, hover, `poker`/`pachinko`/`sleep` types |
| `fishing/world-marker.js` | Waypoint marker: sphere trigger + proximity, `marker:touch`/`marker:exit` |
| `fishing/game-manager.js` | Consumes `marker:touch`, per-marker cooldown, `_tryMarkerAction` routing |
| `scripts/mcp-setup-world-markers.mjs` | Batch place `worldMarker` entities from anchors (playcanvas repo) |

End-to-end anchor → marker → event → mode → UI wiring: see `playcanvas-scene-wiring.md`.
