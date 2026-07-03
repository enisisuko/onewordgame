# PlayCanvas MCP Workflow

Documents editor automation for placing interactables and inspecting scenes. Complements REST upload for script assets.

## Prerequisites

| Requirement | Detail |
|-------------|--------|
| Cursor mode | **Agent** (MCP tools unavailable in Ask/read-only) |
| `mcp.json` | PlayCanvas server in user `~/.cursor/mcp.json` — **absolute paths required** (see [Troubleshooting](#troubleshooting-mcp-server-errored--err_module_not_found)): |
| | `"command"`: `C:/Program Files/nodejs/node.exe` |
| | `"args"`: `C:/WORKS/playcanvas/editor-mcp-server/node_modules/tsx/dist/cli.mjs`, then `.../src/server.ts` |
| | `"cwd"`: `C:/WORKS/playcanvas/editor-mcp-server` (optional; Cursor may ignore on Windows) |
| | `"env": { "PORT": "52001" }` |
| MCP bridge | WebSocket on **port 52001** (`PORT` env) |
| Editor | PlayCanvas Editor open on target project/scene |
| Extension | PlayCanvas MCP Chrome extension → **CONNECT** (bridges editor ↔ WS) |

**Windows port note:** Default `52000` may conflict with **MSI.CentralServer**; prefer **`52001`** (or higher) in `PORT` and match the extension/bridge config.

## Troubleshooting: MCP server errored / ERR_MODULE_NOT_FOUND

### Symptom

Cursor shows **MCP server errored** for `playcanvas`, or Node logs:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\Users\18025\src\server.ts'
```

(or another path under your user profile instead of `C:\WORKS\playcanvas\editor-mcp-server\`)

### Cause

On **Windows**, Cursor may **not apply** the `cwd` field from `mcp.json`. Relative paths in `command` / `args` are then resolved from the wrong directory (often your home folder), so `src/server.ts` becomes `C:\Users\<you>\src\server.ts`.

### Fix (match current `mcp.json`)

Use **fully qualified paths** for everything that launches the server:

| Field | Example |
|-------|---------|
| `command` | `C:/Program Files/nodejs/node.exe` |
| `args[0]` | `C:/WORKS/playcanvas/editor-mcp-server/node_modules/tsx/dist/cli.mjs` |
| `args[1]` | `C:/WORKS/playcanvas/editor-mcp-server/src/server.ts` |
| `env.PORT` | `52001` (avoid MSI.CentralServer on default `52000`) |

Keep `"cwd": "C:/WORKS/playcanvas/editor-mcp-server"` for documentation and tools that honor it; do **not** rely on `cwd` alone on Windows.

Restart Cursor after editing `mcp.json`.

### Do not use (stdio MCP)

- **`npx tsx ...`** as the MCP `command` — extra process/wrapper can break stdio transport.
- Spawning **`npx tsx`** or the **tsx `cli.mjs` wrapper** via **`execSync`** from helper scripts when you need a long-lived stdio MCP child — use the same absolute `node.exe` + `cli.mjs` + `server.ts` pattern in `mcp.json` instead.

## Failure modes (empty-window / no editor)

| Symptom | Cause | Fallback |
|---------|-------|----------|
| MCP tools missing | `playcanvas` not in session `mcp.json` | Add server config; restart Cursor |
| Connection timeout | Extension not CONNECT or wrong scene | Open editor, click CONNECT, retry |
| `list_entities` empty / error | Wrong project tab in editor | Confirm scene URL matches project ID below |
| Script/asset changes | MCP cannot replace binary uploads reliably | **REST API** via `upload-cloud-patched.mjs` |

**Prefer REST API over MCP for script uploads** (user rule). MCP is for entity/component/scene edits; API is for asset file bodies.

## Project IDs

Confirm via editor URL `.../editor/scene/<sceneId>` before any operation.

| Project | ID | Branch (main) | Scene | Scripts root |
|---------|-----|---------------|-------|--------------|
| Cyber casino / explorer (main) | **1551971** | `22611069-d61a-4796-ae7b-f4c5be709e4e` | 2532760 | `scripts/cloud-patched/` |
| Casino copy / fishing sim | **1552576** | `480b3fdb-5281-4239-b707-cbcb9f75228c` | 2533630 | `scripts/fishing/` + cloud-patched copy |

Do not cross-upload between projects without updating `PROJECT_UPLOADS` asset ID map.

## MCP tools (22)

Registered by `editor-mcp-server` (`src/server.ts`):

### Entities (8)

| Tool | Purpose |
|------|---------|
| `list_entities` | Query hierarchy (`name`, `full` filters) |
| `create_entities` | Create entities with transform/parent |
| `modify_entities` | Patch properties |
| `duplicate_entities` | Clone entities |
| `reparent_entity` | Change parent |
| `delete_entities` | Remove non-root entities |
| `add_components` | Add component data |
| `remove_components` | Strip components |
| `add_script_component_script` | Attach script asset to script component |

### Assets (4)

| Tool | Purpose |
|------|---------|
| `list_assets` | Query assets (`name`, type filters; `full` for detail) |
| `create_assets` | Create asset entries |
| `delete_assets` | Delete assets |
| `instantiate_template_assets` | Spawn template instances |

### Scripts & materials (3)

| Tool | Purpose |
|------|---------|
| `set_script_text` | Patch script asset source in editor |
| `script_parse` | Parse script attributes |
| `set_material_diffuse` | Set material color |

### Scene (2)

| Tool | Purpose |
|------|---------|
| `query_scene_settings` | Read scene settings |
| `modify_scene_settings` | Patch fog/sky/etc. |

### Viewport (2)

| Tool | Purpose |
|------|---------|
| `capture_viewport` | Screenshot |
| `focus_viewport` | Frame entities (`view`: top/front/perspective/…) |

### Store (3)

| Tool | Purpose |
|------|---------|
| `store_search` | Search PlayCanvas store |
| `store_get` | Asset metadata |
| `store_download` | Import store asset |

## Workflow: billboard placement from semantic labels

After `semantic-scene.json` / `mechanic-bindings.json` identify interactable anchors:

```text
1. list_entities          → find Root, GameManager, Camera, Player
2. list_assets            → resolve billboardUi script asset id (type script)
3. create_entities        → Interact_<labelId> at label position/rotation
4. add_components         → element (image) + script
5. add_script_component_script → billboardUi
6. modify_entities        → script attrs: labelText, interactionType, panelWidth/Height
7. focus_viewport         → verify placement vs gaussian mesh
8. capture_viewport       → optional evidence for BUILD_REPORT.md
```

Naming convention: include interaction hint in entity name for fallback inference (`PokerTable_01`, `Sleep_Bed_02`).

Interaction types for cloud-patched: `poker`, `pachinko`, `sleep` — see `playcanvas-interaction-pattern.md`.

### Fishing project alternative

For **1552576**, use `worldMarker` script + sphere `collision` trigger (`trigger: true`, no rigidbody on marker). Reference automation: `scripts/mcp-setup-world-markers.mjs` in playcanvas repo.

## REST API fallback (uploads)

Local repo: `C:\WORKS\playcanvas\`

```bash
# .env (gitignored) — copy from .env.template
# PLAYCANVAS_API_TOKEN=...
# PLAYCANVAS_PROJECT_ID=1551971
# PLAYCANVAS_BRANCH_ID=22611069-d61a-4796-ae7b-f4c5be709e4e

node scripts/upload-cloud-patched.mjs
```

| Env var | Purpose |
|---------|---------|
| `PLAYCANVAS_API_TOKEN` | Organization API token — **never commit** |
| `PLAYCANVAS_PROJECT_ID` | 1551971 or 1552576 |
| `PLAYCANVAS_BRANCH_ID` | Branch UUID for asset PUT |

`upload-cloud-patched.mjs` maps known script asset IDs per project and prepends `ui-layout.js` to bundled scripts.

Upload order matters: `ui-layout.js` bootstrap first, then `game-manager.js`, mini-games, `billboard-ui.js`.

## Agent checklist

- [ ] Editor open on correct scene URL
- [ ] MCP extension CONNECT (port 52001 listening)
- [ ] `list_entities` succeeds before `create_entities`
- [ ] Script changes pushed via REST, not MCP `set_script_text`, unless hotfixing in editor only
- [ ] No tokens or `.env` in git commits
- [ ] `BUILD_REPORT.md` notes MCP vs manual placement and project ID used
