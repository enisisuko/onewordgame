#!/usr/bin/env python3
"""Detect mechanic and playability conflicts."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import detect_conflicts, save_json, print_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect mechanic conflicts")
    parser.add_argument("--playability", default="limited_3d")
    parser.add_argument("--mechanics", nargs="+", default=["pickup", "delivery"])
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    conflicts = detect_conflicts(args.playability, args.mechanics)
    if args.output:
        save_json(args.output, {"conflicts": conflicts})
    errors = [f"{c['a']} vs {c['b']}: {c['reason']}" for c in conflicts]
    if errors:
        print("Detected conflicts (informational):")
        for e in errors:
            print(f"  - {e}")
    else:
        print("No conflicts detected")
    return 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
