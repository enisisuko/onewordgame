#!/usr/bin/env python3
"""Generate design review from feasibility and solvability."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate design review")
    parser.add_argument("solvability", type=Path)
    parser.add_argument("capabilities", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    solv = load_json(args.solvability)
    caps = load_json(args.capabilities)
    free = caps.get("capabilities", {}).get("freeMovement", {})
    review = {
        "coreFantasyPreserved": True,
        "sceneSupportScore": round(free.get("confidence", 0.5), 2),
        "implementationRisk": "low" if solv.get("solvable") else "high",
        "scopeRisk": "low",
        "solvabilityRisk": "low" if solv.get("solvable") else "high",
        "selectedFallbacks": [] if solv.get("solvable") else ["screen_space fallback"],
        "rejectedIdeas": [],
        "approved": bool(solv.get("solvable")),
    }
    save_json(args.output, review)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
