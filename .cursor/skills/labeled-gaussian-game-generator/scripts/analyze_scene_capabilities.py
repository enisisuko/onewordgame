#!/usr/bin/env python3
"""Analyze scene capabilities from labels and semantic scene."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _skill_utils import load_json, analyze_capabilities, save_json


def main() -> int:
    parser = argparse.ArgumentParser(description="Analyze scene capabilities")
    parser.add_argument("labels", type=Path)
    parser.add_argument("semantic", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    labels = load_json(args.labels)
    semantic = load_json(args.semantic)
    caps = analyze_capabilities(labels, semantic)
    save_json(args.output, caps)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
