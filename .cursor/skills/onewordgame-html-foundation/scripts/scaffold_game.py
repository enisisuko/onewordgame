#!/usr/bin/env python3
"""Scaffold the bundled non-SOG game foundation into a target directory."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path


SOG_REFERENCE = "assets/coastal-fishing-vista.sog"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="Target game directory")
    parser.add_argument("--sog", type=Path, help="Optional external .sog scene to copy as assets/scene.sog")
    parser.add_argument("--force", action="store_true", help="Overlay files in a non-empty destination")
    return parser.parse_args()


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def configure_without_sog(destination: Path) -> None:
    asset_urls_path = destination / "assets" / "asset-urls.json"
    metadata_path = destination / "assets" / "gaussian-metadata.json"
    game_spec_path = destination / "generated" / "game-spec.json"

    asset_urls = json.loads(asset_urls_path.read_text(encoding="utf-8-sig"))
    for key in ("sogUrl", "sog_url", "sog", "localSog"):
        if key in asset_urls:
            asset_urls[key] = ""
    asset_urls["placeholder"] = True
    write_json(asset_urls_path, asset_urls)

    metadata = json.loads(metadata_path.read_text(encoding="utf-8-sig"))
    metadata["sogUrl"] = ""
    metadata["qualityTier"] = "procedural_placeholder"
    write_json(metadata_path, metadata)

    game_spec = json.loads(game_spec_path.read_text(encoding="utf-8-sig"))
    game_spec["splatAsset"] = ""
    game_spec["splatSource"] = "procedural placeholder"
    write_json(game_spec_path, game_spec)


def configure_with_sog(destination: Path, source: Path) -> None:
    source = source.expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(f"SOG file not found: {source}")
    if source.suffix.lower() != ".sog":
        raise ValueError(f"Expected a .sog file: {source}")

    target = destination / "assets" / "scene.sog"
    shutil.copy2(source, target)
    replacement = "assets/scene.sog"
    for path in destination.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in {".js", ".json", ".html", ".md"}:
            continue
        text = path.read_text(encoding="utf-8-sig")
        if SOG_REFERENCE in text:
            path.write_text(text.replace(SOG_REFERENCE, replacement), encoding="utf-8")


def main() -> int:
    args = parse_args()
    skill_root = Path(__file__).resolve().parents[1]
    template = skill_root / "assets" / "game-foundation"
    destination = args.destination.expanduser().resolve()

    if not template.is_dir():
        raise FileNotFoundError(f"Bundled template not found: {template}")
    if destination.exists() and any(destination.iterdir()) and not args.force:
        raise FileExistsError(f"Destination is not empty; use --force to overlay: {destination}")

    destination.mkdir(parents=True, exist_ok=True)
    # A newly created or pre-existing empty directory is safe. Non-empty
    # destinations were rejected above unless the caller explicitly chose overlay.
    shutil.copytree(template, destination, dirs_exist_ok=True)

    if args.sog:
        configure_with_sog(destination, args.sog)
        mode = "external_sog"
    else:
        configure_without_sog(destination)
        mode = "procedural_placeholder"

    summary = {
        "destination": str(destination),
        "mode": mode,
        "javascriptModules": len(list((destination / "js").glob("*.js"))),
        "sogBundledInSkill": False,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (FileNotFoundError, FileExistsError, ValueError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(2)
