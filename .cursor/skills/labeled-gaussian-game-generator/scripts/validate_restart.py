#!/usr/bin/env python3
"""Validate restart transitions in state machine."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, print_report


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate restart")
    parser.add_argument("state_machine", type=Path)
    args = parser.parse_args()
    sm = load_json(args.state_machine)
    errors = []
    for state in ("won", "lost", "paused"):
        transitions = sm.get("states", {}).get(state, {}).get("on", {})
        if "restart_pressed" not in transitions:
            errors.append(f"{state} missing restart transition")
    return print_report("restart", errors)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
