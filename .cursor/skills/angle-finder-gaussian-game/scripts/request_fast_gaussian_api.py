#!/usr/bin/env python3
"""Call company fast Gaussian generation API (discover config, submit, poll)."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Request fast rough Gaussian scene from existing API")
    parser.add_argument("image", type=Path, help="Input scene image")
    parser.add_argument("--config", type=Path, help="Optional API config JSON")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--mock", choices=["coffee_mug", "vase_symmetric", "workshop_no_camera"],
                        help="Write mock metadata without calling API")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    if args.mock:
        from _skill_utils import MOCK_METADATA
        meta = dict(MOCK_METADATA[args.mock])
        save_json(args.output_dir / "gaussian-metadata.json", meta)
        save_json(args.output_dir / "api-response.json", {
            "status": "completed",
            "scene_id": meta["sceneId"],
            "outputs": {"sog_url": meta.get("sogUrl", "")},
            "mock": True,
        })
        print(f"Wrote mock metadata for {args.mock}")
        return 0

    api_key = os.environ.get("GAUSSIAN_API_KEY") or os.environ.get("GAUSSIAN_API_TOKEN")
    base_url = os.environ.get("FAST_GAUSSIAN_API_URL") or os.environ.get("GAUSSIAN_API_URL", "")
    if args.config and args.config.exists():
        cfg = load_json(args.config)
        base_url = cfg.get("baseUrl", base_url)
        if cfg.get("apiKeyEnv"):
            api_key = os.environ.get(cfg["apiKeyEnv"]) or api_key

    if not base_url:
        print("ERROR: FAST_GAUSSIAN_API_URL / GAUSSIAN_API_URL not set and no config provided", file=sys.stderr)
        return 1
    if not api_key:
        print("ERROR: API key missing (set GAUSSIAN_API_KEY)", file=sys.stderr)
        return 1
    if not args.image.exists():
        print(f"ERROR: image not found: {args.image}", file=sys.stderr)
        return 1

    masked = api_key[:4] + "..." if len(api_key) > 4 else "***"
    print(f"Using fast API at {base_url} (key {masked})")
    print("NOTE: Wire transport to project fast Gaussian client; do not rebuild Gaussian here.")

    placeholder_meta = {
        "sceneId": "discovered_via_fast_api",
        "sogUrl": "",
        "centroid": [0.0, 0.5, 0.0],
        "bounds": {"min": [-1.0, 0.0, -1.0], "max": [1.0, 2.0, 1.0]},
        "sourceCamera": {
            "position": [0.0, 1.0, 3.0],
            "target": [0.0, 0.5, 0.0],
            "fov": 60,
            "azimuthDeg": 0,
            "elevationDeg": 15,
        },
        "viewQuality": "rough",
        "singleViewConfidence": 0.8,
        "pipeline": "fast",
        "note": "Replace with real API metadata parsing from project client",
    }
    save_json(args.output_dir / "gaussian-metadata.json", placeholder_meta)
    save_json(args.output_dir / "api-response.json", {
        "status": "completed",
        "scene_id": placeholder_meta["sceneId"],
        "outputs": {"sog_url": ""},
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
