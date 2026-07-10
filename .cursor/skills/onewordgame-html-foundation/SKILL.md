---
name: onewordgame-html-foundation
description: Restore, scaffold, or adapt the OneWordGame browser-game foundation from a one-sentence request. Use when an AI needs the existing Three.js + Spark Gaussian runtime, splat-safe depth of field, first-person held-item behavior, desktop/mobile exploration controls, world-marker triggers, explore/minigame state management, or the complete non-SOG aquarium-fishing game logic. Also use when moving this foundation to another AI or creating a new HTML Gaussian game while explicitly excluding .sog scene files.
---

# OneWordGame HTML Foundation

## Goal

Use the bundled non-SOG snapshot as the executable baseline. Preserve working subsystems first, then replace game-specific content from the user's one-sentence request.

Treat `assets/game-foundation/` as immutable source material. Scaffold it into a target project before editing.

## Route the request

- For an exact restore, scaffold the template and keep the fishing loop, marker layout, held rod, DOF, controls, and UI unchanged.
- For a new game, scaffold first, read `references/architecture.md`, then replace only the game-specific layer required by the request.
- For an existing project, compare its modules against the architecture reference and copy only missing subsystems. Do not overwrite unrelated user changes.
- For migration to another AI, install this whole skill folder into that AI's supported Skills root with `scripts/install_skill.py`; then invoke `$onewordgame-html-foundation` explicitly.

## Scaffold deterministically

Run:

```powershell
python scripts/scaffold_game.py <target-directory>
```

Add a scene supplied outside the skill:

```powershell
python scripts/scaffold_game.py <target-directory> --sog <path-to-scene.sog>
```

Never add a `.sog` file to this skill. Without `--sog`, configure the scaffold for the built-in procedural placeholder so the game remains runnable.

Run `python scripts/verify_foundation.py` before modifying the Skill snapshot. Run `python scripts/verify_foundation.py <target-directory> --allow-sog` after scaffolding when a scene was supplied.

## Adapt a one-sentence game

Perform these steps in order:

1. Write the interpreted title, loop, verbs, modes, markers, and win/lose conditions into `generated/game-spec.json`. Record simple assumptions instead of blocking on harmless ambiguity.
2. Update `WORLD_MARKERS`, bounds, spawn, and mode routing in `js/main.js`.
3. Keep `GameManager` as the single owner of explore ↔ minigame transitions. Disable player and mobile input while a minigame owns input.
4. Replace or extend the minigame module. Keep callback-driven boundaries; do not let DOM UI directly mutate the exploration controller.
5. Generalize `FirstPersonRod` into the requested held item only when needed. Preserve its visible root, DOF proxy root, action-event API, per-frame camera attachment, and disposal behavior.
6. Rebuild `DofProxyScene` to approximate the new scene's gameplay surfaces and held item. Keep proxy materials colorless and depth-writing.
7. Update `index.html` UI and labels last, after the loop works.

Read `references/architecture.md` before changing DOF, held items, state flow, or module ownership.

## Preserve rendering invariants

- Keep the Spark-safe DOF path: `PostProcessing` + `DepthOfFieldPass` + `DofProxyScene`. Do not replace it with a raw scene-depth Bokeh pass; Gaussian splats may not provide reliable per-pixel depth.
- Keep the held item's visible geometry out of the proxy scene and its proxy geometry out of the visible scene.
- Mark view-model proxy objects as non-focus targets. Update the visible and proxy transforms from the same local poses every frame.
- Keep render fallback behavior: missing or failed SOG loading must fall back to the procedural point scene rather than stop startup.
- Keep frame-rate-independent camera smoothing and separate player-body position from camera bob/breathing offsets.

## Preserve playability invariants

- Support desktop WASD + look and mobile joystick + touch look.
- Trigger world interactions through `WorldMarkers`; route them through `GameManager`.
- Retain an exit path from every minigame back to exploration.
- Serve over HTTP. Do not validate through `file://`.
- Treat CDN access for Three.js and Spark as a runtime dependency unless the target explicitly vendors them.

## Verify the result

1. Run the foundation verifier and JavaScript syntax checks.
2. Start a local HTTP server in the scaffolded directory.
3. Open the game and require no fatal console errors.
4. Exercise walking, looking, marker entry, minigame entry/exit, restart, and mobile input.
5. Toggle DOF and verify that the scene remains visible, the clear band is stable, and the held item does not become uniformly blurred.
6. Test without a `.sog` file and require procedural fallback; test with the supplied `.sog` separately when available.

## One-sentence invocation examples

- `使用 $onewordgame-html-foundation，原样还原非 SOG 游戏基座到 ./new-game。`
- `使用 $onewordgame-html-foundation，把“在废弃车站寻找三件遗失物”制作成新的高斯探索游戏。`

