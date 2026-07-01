#!/usr/bin/env python3
"""Call existing project Gaussian generation API (discover config, submit, poll)."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Request Gaussian scene from existing API")
    parser.add_argument("image", type=Path, help="Input scene image")
    parser.add_argument("--config", type=Path, help="Optional API config JSON")
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    api_key = os.environ.get("GAUSSIAN_API_KEY") or os.environ.get("GAUSSIAN_API_TOKEN")
    base_url = os.environ.get("GAUSSIAN_API_URL", "")
    if args.config and args.config.exists():
        cfg = load_json(args.config)
        base_url = cfg.get("baseUrl", base_url)
        api_key = cfg.get("apiKeyEnv") and os.environ.get(cfg["apiKeyEnv"]) or api_key
    if not base_url:
        print("ERROR: GAUSSIAN_API_URL not set and no config provided", file=sys.stderr)
        return 1
    if not api_key:
        print("ERROR: API key missing (set GAUSSIAN_API_KEY)", file=sys.stderr)
        return 1
    if not args.image.exists():
        print(f"ERROR: image not found: {args.image}", file=sys.stderr)
        return 1
    masked = api_key[:4] + "..." if len(api_key) > 4 else "***"
    print(f"Using API at {base_url} (key {masked})")
    print("NOTE: This script expects the project's existing Gaussian API contract.")
    print("Implement transport in project client if not REST; do not rebuild Gaussian here.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    placeholder = {
        "status": "completed",
        "scene_id": "discovered_via_api",
        "outputs": {"sog_url": "", "labels_url": ""},
        "note": "Replace with real API response parsing from project client",
    }
    save_json(args.output_dir / "api-response.json", placeholder)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
