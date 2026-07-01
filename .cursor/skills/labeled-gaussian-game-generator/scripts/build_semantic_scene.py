#!/usr/bin/env python3
"""Build semantic scene graph from scene labels."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, save_json, build_semantic_scene


def main() -> int:
    parser = argparse.ArgumentParser(description="Build semantic-scene.json")
    parser.add_argument("input", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    labels = load_json(args.input)
    semantic = build_semantic_scene(labels)
    save_json(args.output, semantic)
    print(f"Wrote {len(semantic['entities'])} entities to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
