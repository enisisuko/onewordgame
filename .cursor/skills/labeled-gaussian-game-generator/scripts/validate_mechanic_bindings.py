#!/usr/bin/env python3
"""Validate mechanic-bindings.json."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, validate_schema_minimal, print_report, SCHEMAS_DIR


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate mechanic bindings")
    parser.add_argument("input", type=Path)
    args = parser.parse_args()
    data = load_json(args.input)
    errors = validate_schema_minimal(data, SCHEMAS_DIR / "mechanic-bindings.schema.json")
    ids = [b.get("mechanicId") for b in data.get("bindings", [])]
    if len(ids) != len(set(ids)):
        errors.append("duplicate mechanicId in bindings")
    return print_report("mechanic-bindings", errors)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
