#!/usr/bin/env python3
"""Validate game loop artifacts exist and state machine is coherent."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, print_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate game loop")
    parser.add_argument("state_machine", type=Path)
    parser.add_argument("game_spec", type=Path)
    args = parser.parse_args()
    sm = load_json(args.state_machine)
    spec = load_json(args.game_spec)
    errors = []
    required_states = {"loading", "playing", "won", "lost", "restarting"}
    if not required_states.issubset(sm.get("states", {})):
        errors.append("state machine missing required states")
    if not spec.get("winCondition") or not spec.get("loseCondition"):
        errors.append("game spec missing win/lose conditions")
    return print_report("game loop", errors)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
