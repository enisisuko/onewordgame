#!/usr/bin/env python3
"""Validate scene label JSON structure."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, validate_schema_minimal, print_report, SCHEMAS_DIR


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate scene labels file")
    parser.add_argument("input", type=Path, help="scene-labels.json path")
    args = parser.parse_args()
    data = load_json(args.input)
    if not isinstance(data, dict):
        return print_report("scene labels", ["root must be object"])
    errors = validate_schema_minimal(data, SCHEMAS_DIR / "scene-labels.schema.json")
    if not data.get("objects"):
        errors.append("objects array must not be empty")
    for obj in data.get("objects", []):
        if "id" not in obj:
            errors.append("object missing id")
        if "confidence" in obj and not 0 <= float(obj["confidence"]) <= 1:
            errors.append(f"invalid confidence on {obj.get('id', '?')}")
    return print_report(args.input.name, errors)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
