#!/usr/bin/env python3
"""Score mechanic feasibility against scene capabilities."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, score_mechanic, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Score mechanics")
    parser.add_argument("capabilities", type=Path)
    parser.add_argument("mechanics", nargs="+")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    caps = load_json(args.capabilities)
    scores = [score_mechanic(m, caps) for m in args.mechanics]
    save_json(args.output, {"scores": scores})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
