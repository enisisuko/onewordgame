# PlayCanvas Scene Wiring (anchors → markers → events → UI loop)

End-to-end recipe for turning a **semantic scene** into a playable PlayCanvas scene using the
**waypoint-marker + contact-trigger** and **closed-loop Canvas UI** patterns. Read together with:

- `playcanvas-interaction-pattern.md` — `worldMarker` / `billboardUi` contracts
- `playcanvas-ui-minigame-pattern.md` — mode machine, event bus, closed-loop states
- `playcanvas-mcp-workflow.md` — MCP prerequisites, 23 tools, REST upload fallback

## The closed loop, end to end

```text
semantic-scene.json entities (position, bounds, gameRoles, confidence)
  → pick interactable anchors  → assign interactionType per label
  → MCP: create marker entity at anchor + attach worldMarker script (script self-builds sphere trigger + label + mesh)
  → [runtime] player walks into marker → marker:touch { type, marker }
  → GameManager._onMarkerTouch → _tryMarkerAction(type) → start<Mode>()
      → gate (energy/gold/satiety) → lockPlayer → setMode(<mode>) → app.fire('game:enter<Mode>')
  → <mode>Game.openSession() → closed-loop UI (betting→play→result→restart/exit)
  → exit/complete → gm.setMode('fps') → unlockPlayer → markers re-armed
```

One scene = **a few markers** (each a distinct `interactionType`) + **a few closed-loop UIs** (one per mode).

## Step 1 — Extract anchors from `semantic-scene.json`

For each entity that maps to a mini-game (see label→type table in `playcanvas-interaction-pattern.md`):

| Field | Use |
|-------|-----|
| `position` / `bounds.center` | Marker world position (drop Y to floor + let `labelOffsetY` raise the label) |
| `confidence` | ≥ 0.85 primary; 0.60–0.85 only if reachable/faces approach; &lt; 0.60 → synthetic anchor (note in report) |
| `gameRoles` / `affordances` | Choose `interactionType` (`fishing`/`roast`/`rest`/`shop` or `poker`/`pachinko`/`sleep`) |
| `relations.reachable_from` | Confirm the player can actually walk into the trigger radius |

Output a small placement list (also feed to `scripts/mcp-setup-world-markers.mjs` for batch runs):

```json
[
  { "name": "Marker_Water_01", "type": "fishing", "position": [12.4, 0.0, -3.1], "triggerRadius": 1.2, "labelText": "钓鱼" },
  { "name": "Marker_Grill_01", "type": "roast",   "position": [8.0, 0.0, 2.5],  "triggerRadius": 1.0, "labelText": "烤鱼" },
  { "name": "Marker_Bed_01",   "type": "rest",    "position": [-4.2, 0.0, 5.0], "triggerRadius": 1.0, "labelText": "休息" }
]
```

## Step 2 — MCP preflight

**Always read the tool schema before the first call of each distinct tool** (`.../mcps/user-playcanvas/tools/*.json`).

```text
1. list_entities {}                         → map hierarchy; find Root, GameManager, Camera, Player (capture their ids)
2. list_entities { "component": "script" }  → confirm gameManager entity + player character-controller
3. list_assets   { "type": "script" }       → resolve worldMarker / billboardUi script asset presence
4. query_scene_settings {}                   → coordinate / camera context
```

If **any** call returns `No socket` / connection error, the editor bridge is **not connected** — stop MCP writes and
use the [Fallback](#fallback-mcp-unreachable-no-socket) path. Do **not** fabricate entity ids or scene contents.

## Step 3 — Recipe A: place a waypoint marker (`worldMarker`)

`worldMarker` self-provisions its sphere **trigger** collision, label plane, and mesh in `initialize()`.
So the minimal MCP footprint is: **create an empty transform at the anchor → attach the script → set attributes.**
Do **not** author the collision via MCP — the schema has no `trigger`/`group`/`mask` fields (the script sets them).

```text
1. create_entities
   {
     "entities": [
       {
         "entity": {
           "name": "Marker_Water_01",
           "position": [12.4, 0.0, -3.1],     // LOCAL to parent; parent to Root ⇒ local == world
           "tags": ["marker", "fishing"]
         },
         "parent": "<ROOT_OR_MARKERS_GROUP_UUID>"
       }
     ]
   }
   → returns new entity id(s)

2. add_script_component_script { "id": "<MARKER_UUID>", "scriptName": "worldMarker" }
   (adds the script component if missing and binds the worldMarker class)

3. modify_entities
   {
     "edits": [
       { "id": "<MARKER_UUID>", "path": "components.script.scripts.worldMarker.attributes.interactionType", "value": "fishing" },
       { "id": "<MARKER_UUID>", "path": "components.script.scripts.worldMarker.attributes.triggerRadius",   "value": 1.2 },
       { "id": "<MARKER_UUID>", "path": "components.script.scripts.worldMarker.attributes.labelText",       "value": "钓鱼" }
     ]
   }
```

> Attributes can also be supplied inline in `create_entities` under
> `components.script.scripts.worldMarker.attributes`, but attaching the class via
> `add_script_component_script` afterward is the reliable way to bind the script asset.

Repeat for each anchor (`roast`, `rest`, `shop`). Group them under a `Markers` entity for tidiness (optional).

**Prerequisite:** the target GameManager must be the **fishing** `game-manager.js` (it calls `_bindMarkerEvents()` and
routes `marker:touch`). The casino `cloud-patched/game-manager.js` does **not** listen for `marker:touch` — use Recipe B there.

## Step 3 — Recipe B: place a billboard (`billboardUi`, casino ray-pick)

Casino scenes use click/aim selection. The billboard needs an `element` (image) component.

```text
1. create_entities
   {
     "entities": [
       {
         "entity": {
           "name": "PokerTable_Billboard_01",
           "position": [3.0, 1.6, -2.0],
           "components": {
             "element": { "type": "image", "width": 512, "height": 256, "useInput": true, "layers": [4] }
           }
         },
         "parent": "<ROOT_UUID>"
       }
     ]
   }

2. add_script_component_script { "id": "<BILLBOARD_UUID>", "scriptName": "billboardUi" }

3. modify_entities
   {
     "edits": [
       { "id": "<BILLBOARD_UUID>", "path": "components.script.scripts.billboardUi.attributes.interactionType", "value": "poker" },
       { "id": "<BILLBOARD_UUID>", "path": "components.script.scripts.billboardUi.attributes.labelText",       "value": "POKER" }
     ]
   }
```

Keep the billboard within `GameManager.interactDistance` (**12** world units) of a typical player stand point, and
facing the play area. `billboardUi` overrides most element props at runtime (canvas texture, double-sided material).

## Step 4 — Verify placement

```text
focus_viewport   { "view": "perspective" } (or frame the marker ids)  → visually confirm vs gaussian mesh
capture_viewport {}                                                    → optional evidence for BUILD_REPORT.md
```

Runtime checklist after Launch:

- Walk the player into each `worldMarker` → console logs `[WorldMarker] marker:touch via trigger|proximity <type>`;
  the matching mode opens; HUD hides.
- Casino: aim/click each billboard within 12 u → HUD shows `CLICK · POKER`, mini-game opens.
- Complete/exit each UI → returns to `fps`, HUD returns, player unlocks; markers re-arm (no double-trigger thanks to the 0.5s cooldown).

## Coordinate & parenting notes

- `create_entities` `position`/`rotation`/`scale` are **local to `parent`**. Parent to **Root** so local coordinates
  equal the semantic-scene world coordinates; otherwise subtract the parent's world transform.
- `parent` is a sibling of `entity` inside each array item and must be an existing entity **uuid** (from `list_entities`).
- Markers are floor objects: use the label's floor Y; `labelOffsetY` (default 1.5 m) lifts the floating label.

## Fallback (MCP unreachable / `No socket`)

When the editor bridge is down (empty-window session, extension not **CONNECT**ed, or the exact error `No socket`):

1. **Do not** invent entity ids or "live" scene contents; report the exact error.
2. Author markers **offline** and push via the playcanvas repo helper:
   `node scripts/mcp-setup-world-markers.mjs` (batch-creates `worldMarker` entities from an anchor list once a
   bridge is available) — or hand-write coordinates from `semantic-scene.json`.
3. **Script bodies** always go through **REST API** (`upload-cloud-patched.mjs` + `.env` token), never MCP
   `set_script_text` — see `playcanvas-mcp-workflow.md`. Never commit the token / `.env`.
4. Record in `BUILD_REPORT.md` whether placement was MCP vs offline, and the project id used.

## Authoritative names

The class names, event names, and attribute names in these docs come from the **local reference scripts**
(`C:\WORKS\playcanvas\scripts\fishing\` and `\cloud-patched\`), which are the source of truth when the live editor
is not reachable. If a future run reads the live scene via MCP and finds different entity/script names, record the
**live** names in `BUILD_REPORT.md` and prefer them for that project.

| Symbol | Value (local source of truth) |
|--------|-------------------------------|
| Waypoint script class | `worldMarker` (`pc.createScript('worldMarker')`) |
| Billboard script class | `billboardUi` |
| Manager script class | `gameManager` |
| Contact events | `marker:touch`, `marker:exit` (payload `{ type, marker }`) |
| Mode-enter events | `game:enterFishing` / `enterRoastFish` / `enterRest` / `enterShop`; `game:enterPoker` / `enterPachinko` / `enterSleep` |
| Project ids | 1551971 (casino, ray-pick), 1552576 (fishing, waypoint markers) |
