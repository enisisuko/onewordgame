#!/usr/bin/env python3
"""Verify game solvability from bindings and semantic scene."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, verify_solvable, save_json, print_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify solvability")
    parser.add_argument("routing", type=Path)
    parser.add_argument("semantic", type=Path)
    parser.add_argument("bindings", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    routing = load_json(args.routing)
    semantic = load_json(args.semantic)
    bindings = load_json(args.bindings).get("bindings", [])
    report = verify_solvable(routing["primaryArchetype"], semantic, bindings)
    save_json(args.output, report)
    return print_report("solvability", [] if report["solvable"] else ["game not solvable"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
