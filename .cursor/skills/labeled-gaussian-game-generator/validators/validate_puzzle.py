#!/usr/bin/env python3
"""Validate puzzle game artifacts."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from _skill_utils import load_json, print_report


CHECKS = [
        'at least one legal solution',
        'restart resets puzzle'
]


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate puzzle game")
    parser.add_argument("game_spec", type=Path)
    parser.add_argument("bindings", type=Path)
    args = parser.parse_args()
    spec = load_json(args.game_spec)
    bindings = load_json(args.bindings)
    errors = []
    if not spec.get("winCondition"):
        errors.append("missing winCondition")
    if not bindings.get("bindings"):
        errors.append("missing mechanic bindings")
    for check in CHECKS:
        if check not in str(spec) and check not in str(bindings):
            errors.append(f"heuristic check not evidenced: {check}")
    return print_report("puzzle", errors[:1] if len(errors) > 2 else errors)


if __name__ == "__main__":
    raise SystemExit(main())
