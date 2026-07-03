# PlayCanvas Interaction Pattern (cloud-patched)

Source of truth: `C:\WORKS\playcanvas\scripts\cloud-patched\` (`game-manager.js`, `billboard-ui.js`).

Use this when binding semantic labels to in-world interactables in FPS exploration mode.

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

## Alternative: world-marker proximity (fishing project)

For **project 1552576** / `scripts/fishing/world-marker.js`, use proximity triggers instead of ray pick:

| Pattern | Script | Trigger | Events |
|---------|--------|---------|--------|
| Billboard ray pick | `billboardUi` | Mouse/touch ray | Direct `GameManager.start*` |
| World marker | `worldMarker` | Sphere proximity + optional physics trigger | `marker:touch`, `marker:exit` |

`WorldMarker` defaults:

- `triggerRadius`: **0.9** m (effective radius + 0.35 m player padding in `_updateProximityTouch`)
- `interactionType`: `fishing` \| `roast` \| `rest` \| `shop`
- Fires `marker:touch` when player enters radius (or `collision` trigger enter)
- Requires `app.gameManager.player` and `gm.mode === 'fps'`

Use **billboardUi** for cloud-patched FPS casino (project **1551971**). Use **worldMarker** when the target project already routes `marker:touch` in `game-manager` (fishing sim). Do not mix both on the same interactable.

## Reference paths

| File | Role |
|------|------|
| `cloud-patched/game-manager.js` | `interactDistance`, aim, mode transitions |
| `cloud-patched/billboard-ui.js` | Ray pick, hover, interaction types |
| `fishing/world-marker.js` | Proximity / trigger alternative |
