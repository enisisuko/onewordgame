# Architecture and replacement boundaries

## Contents

1. Snapshot boundary
2. Runtime graph
3. Foundation modules
4. Game-specific modules
5. DOF and held-item contracts
6. Customization order

## Snapshot boundary

The bundled template is a 2026-07-10 snapshot of `output-angle-game` game code. It contains every JavaScript module, runtime HTML, JSON game/config data, and DOF research document used by the project. It intentionally excludes:

- every `.sog` file;
- `node_modules` and test outputs;
- source/upload images and favicon;
- packaging reports and handoff documents.

The template can boot without a SOG through `GaussianLoaderV2`'s procedural fallback. Three.js and Spark are loaded from the import map in `index.html`.

## Runtime graph

```text
index.html
  -> main.js
      -> GaussianLoaderV2 -> Spark or procedural fallback
      -> PlayerController -> CameraEffects
      -> MobileControls
      -> WorldMarkers -> GameManager -> FishingGame / MarkerPanelGame
      -> FirstPersonRod <-> FishingGame onRodAction events
      -> PostProcessing -> DepthOfFieldPass
                        -> DofProxyScene + FirstPersonRod.proxyRoot
```

## Foundation modules

Preserve or generalize these modules across games:

| Module | Contract |
| --- | --- |
| `GaussianLoaderV2.js` | Load SOG/PLY through Spark and fall back to procedural points on failure. |
| `PlayerController.js` | Own body position, WASD/mobile movement, look targets, bounds, and enable state. |
| `CameraEffects.js` | Apply frame-rate-independent look smoothing, head bob, and idle breathing. |
| `MobileControls.js` | Expose normalized movement and per-frame look deltas; obey enable state. |
| `WorldMarkers.js` | Visualize range markers and emit entry events with cooldown semantics. |
| `GameManager.js` | Own top-level gameplay mode transitions and input handoff. |
| `PostProcessing.js` | Coordinate composer, focus behavior, quality, and the proxy depth scene. |
| `DepthOfFieldPass.js` | Implement Spark-safe clear-zone/blur composition without trusting splat depth. |
| `DofProxyScene.js` | Approximate gameplay depth with ordinary meshes that write depth only. |
| `Skybox.js` | Render the non-depth-writing gradient background. |

`ClaritySystem.js`, `GuessUI.js`, `OrbitCamera.js`, and `GaussianLoader.js` are retained legacy/alternate-mode logic. Reuse them only for orbit/guess games; they are not part of the current fishing entry graph.

## Game-specific modules

- `FishingGame.js`: complete cast → wait → hook → fight → result loop and DOM state.
- `FirstPersonRod.js`: fishing view-model, hand, line, hook, action animation, and matching DOF proxy.
- `MarkerPanelGame.js`: informational interactions for non-fishing markers.
- `main.js`: aquarium composition root, marker definitions, spawn/bounds, scene geometry, and mode wiring.
- `index.html`: current phone-frame presentation and all fishing/exploration DOM.
- `generated/*.json`: current intent/spec/curve data.

For a new genre, keep their boundaries but replace their content. Rename modules only after imports, callbacks, DOM IDs, and validation expectations are updated together.

## DOF and held-item contracts

`PostProcessing.setDofProxyRoot(root)` receives only proxy geometry. The proxy scene must mirror important ground, structures, markers, and view-model geometry closely enough to produce believable clear/blur regions.

A held item must expose two roots:

- a visible root attached to camera motion in the main scene;
- a depth-only proxy root updated from the same local pose.

Route gameplay animation as semantic events such as `equip`, `stow`, `charge`, `cast`, `hook`, `reel-start`, and `reel-stop`. Let the held-item module translate events into animation state. Do not make the minigame reach into mesh internals.

## Customization order

1. Change JSON spec and marker semantics.
2. Change the minigame state machine and callbacks.
3. Change the held item and its action vocabulary.
4. Change scene/proxy geometry and bounds.
5. Change DOM/CSS presentation.
6. Tune DOF and camera effects only after gameplay and scale are stable.

