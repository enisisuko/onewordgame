#!/usr/bin/env python3
"""Route game genre from intent."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, route_genre, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Route genre")
    parser.add_argument("intent", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    intent = load_json(args.intent)
    routing = route_genre(intent["rawRequest"], intent)
    save_json(args.output, routing)
    print(f"Primary archetype: {routing['primaryArchetype']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
