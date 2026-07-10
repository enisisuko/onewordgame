#!/usr/bin/env python3
"""Verify the bundled or scaffolded OneWordGame HTML foundation."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path


REQUIRED = (
    "index.html",
    "js/main.js",
    "js/GaussianLoaderV2.js",
    "js/PlayerController.js",
    "js/CameraEffects.js",
    "js/MobileControls.js",
    "js/WorldMarkers.js",
    "js/GameManager.js",
    "js/FishingGame.js",
    "js/FirstPersonRod.js",
    "js/PostProcessing.js",
    "js/DepthOfFieldPass.js",
    "js/DofProxyScene.js",
    "generated/game-spec.json",
    "assets/asset-urls.json",
    "assets/gaussian-metadata.json",
)
IMPORT_RE = re.compile(r"\bfrom\s+['\"](\.[^'\"]+)['\"]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    default = Path(__file__).resolve().parents[1] / "assets" / "game-foundation"
    parser.add_argument("target", nargs="?", type=Path, default=default)
    parser.add_argument("--allow-sog", action="store_true", help="Allow .sog files in a scaffolded target")
    return parser.parse_args()


def verify(target: Path, allow_sog: bool) -> list[str]:
    errors: list[str] = []
    for relative in REQUIRED:
        if not (target / relative).is_file():
            errors.append(f"missing required file: {relative}")

    if any(path.name == "node_modules" for path in target.rglob("node_modules")):
        errors.append("node_modules must not be bundled")
    sog_files = list(target.rglob("*.sog"))
    if sog_files and not allow_sog:
        errors.append(".sog files must not be bundled: " + ", ".join(str(p.relative_to(target)) for p in sog_files))

    json_files = list(target.rglob("*.json"))
    for path in json_files:
        try:
            json.loads(path.read_text(encoding="utf-8-sig"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            errors.append(f"invalid JSON {path.relative_to(target)}: {exc}")

    js_files = list((target / "js").glob("*.js")) if (target / "js").is_dir() else []
    for path in js_files:
        text = path.read_text(encoding="utf-8-sig")
        for import_path in IMPORT_RE.findall(text):
            resolved = (path.parent / import_path).resolve()
            if not resolved.is_file():
                errors.append(f"unresolved import in {path.name}: {import_path}")

    index = (target / "index.html")
    if index.is_file():
        html = index.read_text(encoding="utf-8-sig")
        for token in ('"three"', '"@sparkjsdev/spark"', 'src="js/main.js"'):
            if token not in html:
                errors.append(f"index.html missing runtime token: {token}")

    main = target / "js" / "main.js"
    fishing = target / "js" / "FishingGame.js"
    if main.is_file() and fishing.is_file():
        combined = main.read_text(encoding="utf-8-sig") + fishing.read_text(encoding="utf-8-sig")
        for token in ("onRodAction", "handleFishingAction", "setDofProxyRoot", "createDofProxyRoot"):
            if token not in combined:
                errors.append(f"held-item/DOF contract missing token: {token}")

    node = shutil.which("node")
    if node:
        for path in js_files:
            result = subprocess.run([node, "--check", str(path)], capture_output=True, text=True)
            if result.returncode:
                errors.append(f"JavaScript syntax error in {path.name}: {result.stderr.strip()}")

    return errors


def main() -> int:
    args = parse_args()
    target = args.target.expanduser().resolve()
    if not target.is_dir():
        print(f"error: target directory not found: {target}", file=sys.stderr)
        return 2

    errors = verify(target, args.allow_sog)
    if errors:
        for error in errors:
            print(f"FAIL: {error}", file=sys.stderr)
        return 1

    print(json.dumps({
        "status": "ok",
        "target": str(target),
        "javascriptModules": len(list((target / "js").glob("*.js"))),
        "jsonFiles": len(list(target.rglob("*.json"))),
        "sogFiles": len(list(target.rglob("*.sog"))),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())

