#!/usr/bin/env python3
"""Emit default game state machine."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import default_state_machine, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Build state machine")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    save_json(args.output, default_state_machine())
    print(f"Wrote state machine to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
