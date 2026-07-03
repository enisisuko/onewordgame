#!/usr/bin/env python3
"""Validate angle game spec against minimal schema rules."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import SCHEMAS_DIR, load_json, print_report, validate_schema_minimal


def validate_logic(spec: dict) -> list[str]:
    errors: list[str] = []
    if spec.get("guessMode") == "multi_choice":
        choices = spec.get("choices", [])
        answer = spec.get("correctAnswer", "")
        if answer not in choices:
            errors.append("multi_choice mode requires correctAnswer in choices[]")
        if len(choices) < 2:
            errors.append("multi_choice requires at least 2 choices")
    if spec.get("enableRotationBudget") and not spec.get("rotationBudgetRadians"):
        errors.append("rotation budget enabled but rotationBudgetRadians missing")
    threshold = spec.get("clarityWinThreshold", 0.85)
    if not 0.5 <= threshold <= 1.0:
        errors.append(f"clarityWinThreshold out of range: {threshold}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate game-spec.json for angle finder game")
    parser.add_argument("spec", type=Path)
    args = parser.parse_args()

    spec = load_json(args.spec)
    errors = validate_schema_minimal(spec, SCHEMAS_DIR / "angle-game-spec.schema.json")
    errors.extend(validate_logic(spec))
    return print_report(f"validate {args.spec.name}", errors)


if __name__ == "__main__":
    raise SystemExit(main())
